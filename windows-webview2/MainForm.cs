using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace QrGuardLite
{
    internal enum GuardState
    {
        Locked,
        Unlocked,
        SiteLogin,
        Settings
    }

    internal sealed class MainForm : Form
    {
        // Reloading the hidden page keeps sliding server sessions alive while locked.
        private const int LockedRefreshMs = 60000;
        private const string BrowserArguments = "--disk-cache-size=33554432";
        private static readonly TimeSpan SiteLoginCap = TimeSpan.FromMinutes(5);

        private readonly WebView2 webView = new WebView2 { Dock = DockStyle.Fill };
        private readonly TableLayoutPanel toolbar = new TableLayoutPanel();
        private readonly Label statusLabel = new Label();
        private readonly TextBox addressBox = new TextBox();
        private readonly Button backButton;
        private readonly Button forwardButton;
        private readonly Button reloadButton;
        private readonly Button readyButton;
        private readonly Button lockButton;
        private readonly Panel lockPanel = new Panel();
        private readonly TableLayoutPanel lockCard = Ui.Column(autoSize: true);
        private readonly ComboBox regionBox = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Dock = DockStyle.Fill };
        private readonly TextBox codeBox = new TextBox { Dock = DockStyle.Fill, UseSystemPasswordChar = true };
        private readonly Label errorLabel = Ui.Message();
        private readonly Label loadFailureLabel = Ui.Message();
        private readonly FlowLayoutPanel loadFailurePanel;
        private readonly Button unlockButton;
        private readonly Button siteLoginButton;
        private readonly Button settingsButton;
        private readonly Timer tickTimer = new Timer { Interval = 500 };
        private readonly Timer refreshTimer = new Timer { Interval = LockedRefreshMs };
        private readonly ToolTip toolTip = new ToolTip();
        private readonly AppSettings settings;

        private GuardState state = GuardState.Locked;
        private string sessionUser;
        private DateTime sessionStartUtc;
        private DateTime sessionDeadlineUtc;
        private bool isBusy;

        public MainForm(AppSettings settings)
        {
            this.settings = settings;
            Font = Ui.Font;
            MinimumSize = new Size(Ui.S(720), Ui.S(540));
            Size = new Size(Ui.S(1280), Ui.S(800));
            StartPosition = FormStartPosition.CenterScreen;
            Text = AppInfo.Name;

            backButton = IconButton("\uE72B", "뒤로 (Alt+←)", (sender, args) => webView.CoreWebView2?.GoBack());
            forwardButton = IconButton("\uE72A", "앞으로 (Alt+→)", (sender, args) => webView.CoreWebView2?.GoForward());
            reloadButton = IconButton("\uE72C", "새로고침 (F5)", (sender, args) => webView.CoreWebView2?.Reload());
            readyButton = Ui.Button("QR 송출 준비 완료", (sender, args) => Relock("manual"));
            lockButton = Ui.Button("지금 잠그기", (sender, args) => Relock("manual"), primary: true);
            unlockButton = Ui.Button("잠금 해제", (sender, args) => Unlock(), primary: true);
            siteLoginButton = Ui.Button("사이트 로그인", (sender, args) => StartSiteLogin());
            settingsButton = Ui.Button("설정", (sender, args) => OpenSettings());
            loadFailurePanel = Ui.Row(loadFailureLabel, Ui.Button("다시 시도", (sender, args) => NavigateHome()));
            toolTip.SetToolTip(lockButton, "지금 잠그기 (Esc)");

            BuildToolbar();
            BuildLockPanel();
            // Dock order: toolbar takes the top, the browser fills the rest, the lock panel covers it.
            Controls.Add(lockPanel);
            Controls.Add(webView);
            Controls.Add(toolbar);
            lockPanel.BringToFront();
            toolbar.Visible = false;

            tickTimer.Tick += (sender, args) => OnTick();
            refreshTimer.Tick += (sender, args) => RefreshWhileLocked();
            // Accelerators pressed inside the page arrive here; WebView2 APIs must not run inside this handler.
            webView.KeyDown += (sender, args) =>
            {
                var keys = args.KeyData;

                if (IsQrVisible && (keys == (Keys.Control | Keys.L) || keys == Keys.Escape))
                {
                    args.Handled = true;
                    BeginInvoke(new Action(() => HandleShortcut(keys)));
                }
            };
            RestoreWindowBounds();
            ReloadRegions();
        }

        protected override async void OnShown(EventArgs e)
        {
            base.OnShown(e);

            try
            {
                var environment = await CoreWebView2Environment.CreateAsync(
                    null, AppPaths.WebViewData, new CoreWebView2EnvironmentOptions(BrowserArguments));
                await webView.EnsureCoreWebView2Async(environment);
            }
            catch (Exception ex) when (ex is WebView2RuntimeNotFoundException || ex is COMException || ex is InvalidOperationException || ex is ArgumentException)
            {
                MessageBox.Show("브라우저 엔진을 시작할 수 없습니다." + Environment.NewLine + ex.Message, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            ConfigureBrowser(webView.CoreWebView2);
            NavigateHome();
            SetState(GuardState.Locked);
        }

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            // Page-focused keys go through webView.KeyDown; F5 and Alt+arrows are native there.
            return (IsQrVisible && !webView.ContainsFocus && HandleShortcut(keyData)) || base.ProcessCmdKey(ref msg, keyData);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            FinishSession("manual");
            var bounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            var maximized = WindowState == FormWindowState.Maximized ? 1 : 0;
            settings.WindowBounds = $"{bounds.X},{bounds.Y},{bounds.Width},{bounds.Height},{maximized}";
            TrySaveSettings();
            base.OnFormClosing(e);
        }

        private bool IsQrVisible => state == GuardState.Unlocked || state == GuardState.SiteLogin;

        private bool HandleShortcut(Keys keyData)
        {
            switch (keyData)
            {
                case Keys.Control | Keys.L:
                    addressBox.Focus();
                    addressBox.SelectAll();
                    return true;
                // Esc only hides an operator unlock; site login keeps Esc for the site itself.
                case Keys.Escape when state == GuardState.Unlocked:
                    Relock("manual");
                    return true;
                case Keys.F5:
                case Keys.Control | Keys.R:
                    webView.CoreWebView2?.Reload();
                    return true;
                case Keys.Alt | Keys.Left:
                    webView.CoreWebView2?.GoBack();
                    return true;
                case Keys.Alt | Keys.Right:
                    webView.CoreWebView2?.GoForward();
                    return true;
                default:
                    return false;
            }
        }

        private void ConfigureBrowser(CoreWebView2 core)
        {
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsPasswordAutosaveEnabled = true;
            core.Settings.IsGeneralAutofillEnabled = true;
            core.Settings.IsStatusBarEnabled = false;
            // Popups would open uncovered windows, so keep them in the guarded view.
            core.NewWindowRequested += (sender, args) =>
            {
                args.Handled = true;

                if (IsAllowedUrl(args.Uri))
                {
                    core.Navigate(args.Uri);
                }
            };
            core.NavigationStarting += (sender, args) =>
            {
                if (!IsAllowedUrl(args.Uri))
                {
                    args.Cancel = true;
                }
            };
            core.NavigationCompleted += (sender, args) =>
            {
                if (args.IsSuccess)
                {
                    ShowLoadFailure(null);
                }
                else if (args.WebErrorStatus != CoreWebView2WebErrorStatus.OperationCanceled)
                {
                    ShowLoadFailure($"QR 사이트를 불러오지 못했습니다. ({args.WebErrorStatus})");
                }

                UpdateToolbar();
            };
            core.HistoryChanged += (sender, args) => UpdateToolbar();
            core.SourceChanged += (sender, args) => UpdateToolbar();
        }

        private static bool IsAllowedUrl(string uri) =>
            uri == "about:blank" || Ui.IsHttpUrl(uri);

        private void NavigateHome()
        {
            if (webView.CoreWebView2 != null && Ui.IsHttpUrl(settings.QrUrl))
            {
                webView.CoreWebView2.Navigate(settings.QrUrl);
            }
        }

        private void NavigateAddress()
        {
            var text = addressBox.Text.Trim();
            var url = Ui.IsHttpUrl(text) ? text : "https://" + text;

            if (webView.CoreWebView2 != null && Ui.IsHttpUrl(url))
            {
                webView.CoreWebView2.Navigate(url);
                webView.Focus();
            }
        }

        private void SetState(GuardState next)
        {
            state = next;
            var qrVisible = IsQrVisible;

            SuspendLayout();
            readyButton.Visible = next == GuardState.SiteLogin;
            toolbar.Visible = qrVisible;
            webView.Visible = qrVisible;
            lockPanel.Visible = !qrVisible;
            ResumeLayout();

            SetMemoryTarget(qrVisible);
            tickTimer.Enabled = qrVisible;
            refreshTimer.Enabled = next == GuardState.Locked;

            if (qrVisible)
            {
                UpdateStatus();
                UpdateToolbar();
                webView.Focus();
                return;
            }

            codeBox.Clear();
            SelectInitialRegion();
            FocusLockInput();
        }

        private void SetMemoryTarget(bool visible)
        {
            var core = webView.CoreWebView2;

            if (core == null)
            {
                return;
            }

            try
            {
                core.MemoryUsageTargetLevel = visible ? CoreWebView2MemoryUsageTargetLevel.Normal : CoreWebView2MemoryUsageTargetLevel.Low;
            }
            catch (Exception ex) when (ex is NotImplementedException || ex is InvalidCastException)
            {
                // Older runtimes do not support memory targets; locking still works.
            }
        }

        private void RefreshWhileLocked()
        {
            var source = webView.Source;

            if (state == GuardState.Locked && webView.CoreWebView2 != null && source != null && Ui.IsHttpUrl(source.AbsoluteUri))
            {
                webView.CoreWebView2.Reload();
            }
        }

        private void OnTick()
        {
            if (DateTime.UtcNow >= sessionDeadlineUtc)
            {
                Relock("timer");
                return;
            }

            if (IdleInput.Seconds() >= settings.IdleLockSeconds)
            {
                Relock("idle");
                return;
            }

            UpdateStatus();
        }

        private void UpdateStatus()
        {
            if (state == GuardState.SiteLogin)
            {
                statusLabel.ForeColor = Color.FromArgb(138, 90, 0);
                statusLabel.Text = "사이트 로그인 중";
                return;
            }

            var remaining = Math.Max(0, Math.Ceiling((sessionDeadlineUtc - DateTime.UtcNow).TotalSeconds));
            statusLabel.ForeColor = Color.FromArgb(196, 49, 75);
            statusLabel.Text = $"잠금 해제됨 · {remaining:0}초";
        }

        private void UpdateToolbar()
        {
            var core = webView.CoreWebView2;
            backButton.Enabled = core?.CanGoBack == true;
            forwardButton.Enabled = core?.CanGoForward == true;

            if (!addressBox.Focused)
            {
                var source = webView.Source?.AbsoluteUri ?? "";
                addressBox.Text = source == "about:blank" ? "" : source;
            }
        }

        private async void Unlock()
        {
            if (isBusy || state != GuardState.Locked)
            {
                return;
            }

            var region = regionBox.SelectedItem as string;
            var code = codeBox.Text;

            if (region == null)
            {
                Ui.ShowError(errorLabel, "지역을 선택하세요.");
                return;
            }

            if (code.Length == 0)
            {
                Ui.ShowError(errorLabel, "지역과 인증 코드가 필요합니다.");
                return;
            }

            var entry = settings.Regions.FirstOrDefault(candidate => candidate.Id == region);

            if (!await VerifyCode(code, entry?.Salt ?? "", entry?.Hash ?? ""))
            {
                codeBox.Clear();
                codeBox.Focus();
                return;
            }

            settings.LastRegion = region;
            TrySaveSettings();
            BeginSession(region, TimeSpan.FromSeconds(settings.UnlockSeconds));
            SetState(GuardState.Unlocked);
        }

        private async void StartSiteLogin()
        {
            if (isBusy || state != GuardState.Locked)
            {
                return;
            }

            var values = InputDialog.Show(this, "사이트 로그인", new InputField("관리자 코드", secret: true));

            if (values == null || !await VerifyCode(values[0], settings.AdminSalt, settings.AdminHash))
            {
                return;
            }

            BeginSession(AppInfo.AdminAuditUser, SiteLoginCap);
            SetState(GuardState.SiteLogin);
        }

        private async void OpenSettings()
        {
            if (isBusy || state != GuardState.Locked)
            {
                return;
            }

            var values = InputDialog.Show(this, "설정", new InputField("관리자 코드", secret: true));

            if (values == null || !await VerifyCode(values[0], settings.AdminSalt, settings.AdminHash))
            {
                return;
            }

            var previousUrl = settings.QrUrl;
            SetState(GuardState.Settings);

            using (var form = new SettingsForm(settings, webView.CoreWebView2))
            {
                form.ShowDialog(this);
            }

            if (settings.QrUrl != previousUrl)
            {
                NavigateHome();
            }

            ReloadRegions();
            SetState(GuardState.Locked);
        }

        private async Task<bool> VerifyCode(string code, string salt, string hash)
        {
            var remaining = Lockout.Remaining(settings);

            if (remaining > TimeSpan.Zero)
            {
                Ui.ShowError(errorLabel, Lockout.RetryMessage(remaining));
                return false;
            }

            SetBusy(true);
            bool verified;

            try
            {
                verified = await Task.Run(() => CodeHasher.Verify(code, salt, hash));
            }
            finally
            {
                SetBusy(false);
            }

            if (verified)
            {
                Lockout.RecordSuccess(settings);
                errorLabel.Text = "";
            }
            else
            {
                Lockout.RecordFailure(settings);
                var wait = Lockout.Remaining(settings);
                Ui.ShowError(errorLabel, "인증 코드가 올바르지 않습니다." + (wait > TimeSpan.Zero ? " " + Lockout.RetryMessage(wait) : ""));
            }

            TrySaveSettings();
            return verified;
        }

        private void BeginSession(string userId, TimeSpan duration)
        {
            sessionUser = userId;
            sessionStartUtc = DateTime.UtcNow;
            sessionDeadlineUtc = sessionStartUtc + duration;
        }

        private void Relock(string reason)
        {
            if (!IsQrVisible)
            {
                return;
            }

            FinishSession(reason);
            SetState(GuardState.Locked);
        }

        private void FinishSession(string reason)
        {
            if (sessionUser == null)
            {
                return;
            }

            var lockedAt = DateTime.UtcNow;
            var auditEvent = new AuditEvent
            {
                AppVersion = AppInfo.Version,
                DurationSeconds = (int)Math.Max(0, Math.Round((lockedAt - sessionStartUtc).TotalSeconds)),
                LockedAt = lockedAt,
                Reason = reason,
                UnlockedAt = sessionStartUtc,
                UserId = sessionUser
            };
            sessionUser = null;

            try
            {
                AuditLog.Append(auditEvent);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                // Locking must still happen when the log is unwritable.
            }
        }

        private void TrySaveSettings()
        {
            try
            {
                SettingsStore.Save(settings);
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is CryptographicException)
            {
                Ui.ShowError(errorLabel, "설정을 저장할 수 없습니다.");
            }
        }

        private void SetBusy(bool busy)
        {
            isBusy = busy;
            unlockButton.Enabled = !busy;
            siteLoginButton.Enabled = !busy;
            settingsButton.Enabled = !busy;
            UseWaitCursor = busy;
        }

        private void ShowLoadFailure(string message)
        {
            loadFailureLabel.Text = message ?? "";
            loadFailurePanel.Visible = message != null;
        }

        private void ReloadRegions()
        {
            regionBox.BeginUpdate();
            regionBox.Items.Clear();
            regionBox.Items.AddRange(settings.Regions.Select(region => (object)region.Id).ToArray());
            regionBox.EndUpdate();
            regionBox.Enabled = regionBox.Items.Count > 0;
            SelectInitialRegion();

            if (regionBox.Items.Count == 0)
            {
                Ui.ShowError(errorLabel, "설정된 지역이 없습니다. 설정에서 지역을 추가하세요.");
            }
        }

        private void SelectInitialRegion()
        {
            var lastIndex = regionBox.Items.IndexOf(settings.LastRegion);
            regionBox.SelectedIndex = regionBox.Items.Count == 1 ? 0 : lastIndex;
        }

        private void FocusLockInput()
        {
            BeginInvoke(new Action(() =>
            {
                if (regionBox.SelectedIndex >= 0)
                {
                    codeBox.Focus();
                }
                else
                {
                    regionBox.Focus();
                }
            }));
        }

        private void RestoreWindowBounds()
        {
            var parts = settings.WindowBounds.Split(',');
            var numbers = new int[4];

            if (parts.Length != 5 || Enumerable.Range(0, 4).Any(index => !int.TryParse(parts[index], out numbers[index])))
            {
                return;
            }

            var bounds = new Rectangle(numbers[0], numbers[1], numbers[2], numbers[3]);

            // Skip positions left on a monitor that is no longer attached.
            if (!Screen.AllScreens.Any(screen => screen.WorkingArea.IntersectsWith(bounds)))
            {
                return;
            }

            StartPosition = FormStartPosition.Manual;
            Bounds = bounds;

            if (parts[4] == "1")
            {
                WindowState = FormWindowState.Maximized;
            }
        }

        private Button IconButton(string glyph, string tip, EventHandler onClick)
        {
            var button = new Button
            {
                AccessibleName = tip,
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe MDL2 Assets", 11F),
                Margin = new Padding(Ui.S(2), 0, Ui.S(2), 0),
                Size = new Size(Ui.S(36), Ui.S(32)),
                Text = glyph
            };
            button.FlatAppearance.BorderSize = 0;
            button.Click += onClick;
            toolTip.SetToolTip(button, tip);
            return button;
        }

        private void BuildToolbar()
        {
            toolbar.AutoSize = true;
            toolbar.AutoSizeMode = AutoSizeMode.GrowAndShrink;
            toolbar.BackColor = SystemColors.Window;
            toolbar.ColumnCount = 7;
            toolbar.Dock = DockStyle.Top;
            toolbar.Padding = new Padding(Ui.S(8), Ui.S(6), Ui.S(8), Ui.S(6));
            toolbar.RowCount = 1;

            for (var column = 0; column < toolbar.ColumnCount; column++)
            {
                toolbar.ColumnStyles.Add(column == 4 ? new ColumnStyle(SizeType.Percent, 100) : new ColumnStyle(SizeType.AutoSize));
            }

            statusLabel.Anchor = AnchorStyles.Left;
            statusLabel.AutoSize = true;
            statusLabel.Font = new Font(Ui.Font, FontStyle.Bold);
            statusLabel.Margin = new Padding(0, 0, Ui.S(8), 0);
            addressBox.Anchor = AnchorStyles.Left | AnchorStyles.Right;
            addressBox.Margin = new Padding(Ui.S(6), 0, Ui.S(6), 0);
            addressBox.KeyDown += (sender, args) =>
            {
                if (args.KeyCode == Keys.Enter)
                {
                    args.SuppressKeyPress = true;
                    NavigateAddress();
                }
            };
            readyButton.Anchor = AnchorStyles.None;
            lockButton.Anchor = AnchorStyles.None;

            var controls = new Control[] { statusLabel, backButton, forwardButton, reloadButton, addressBox, readyButton, lockButton };
            for (var column = 0; column < controls.Length; column++)
            {
                toolbar.Controls.Add(controls[column], column, 0);
            }

            toolbar.Paint += (sender, args) =>
                args.Graphics.DrawLine(SystemPens.ControlDark, 0, toolbar.Height - 1, toolbar.Width, toolbar.Height - 1);
        }

        private void BuildLockPanel()
        {
            lockPanel.BackColor = Color.FromArgb(243, 242, 241);
            lockPanel.Dock = DockStyle.Fill;
            lockCard.BackColor = SystemColors.Window;
            lockCard.Padding = new Padding(Ui.S(24));
            lockCard.MinimumSize = new Size(Ui.S(380), 0);
            lockCard.MaximumSize = new Size(Ui.S(380), 0);

            var title = new Label { AutoSize = true, Font = new Font(Ui.Font.FontFamily, 16F, FontStyle.Bold), Text = "QR 숨김" };
            var hint = new Label { AutoSize = true, ForeColor = SystemColors.GrayText, Text = "지역 인증 후 QR 화면을 표시합니다." };
            loadFailurePanel.Visible = false;
            codeBox.KeyDown += (sender, args) =>
            {
                if (args.KeyCode == Keys.Enter)
                {
                    args.SuppressKeyPress = true;
                    Unlock();
                }
            };
            regionBox.SelectionChangeCommitted += (sender, args) =>
            {
                errorLabel.Text = "";
                codeBox.Focus();
            };

            lockCard.Controls.Add(title);
            lockCard.Controls.Add(hint);
            lockCard.Controls.Add(loadFailurePanel);
            Ui.AddField(lockCard, "지역", regionBox);
            Ui.AddField(lockCard, "인증 코드", codeBox);
            lockCard.Controls.Add(errorLabel);
            lockCard.Controls.Add(Ui.Row(unlockButton, siteLoginButton, settingsButton));
            lockPanel.Controls.Add(lockCard);

            void Center(object sender, EventArgs args) =>
                lockCard.Location = new Point(
                    Math.Max(0, (lockPanel.ClientSize.Width - lockCard.Width) / 2),
                    Math.Max(0, (lockPanel.ClientSize.Height - lockCard.Height) / 2));
            lockPanel.Resize += Center;
            lockCard.SizeChanged += Center;
        }

        private static class IdleInput
        {
            [StructLayout(LayoutKind.Sequential)]
            private struct LastInputInfo
            {
                public uint Size;
                public uint Time;
            }

            [DllImport("user32.dll")]
            [return: MarshalAs(UnmanagedType.Bool)]
            private static extern bool GetLastInputInfo(ref LastInputInfo info);

            public static double Seconds()
            {
                var info = new LastInputInfo { Size = (uint)Marshal.SizeOf(typeof(LastInputInfo)) };

                return GetLastInputInfo(ref info) ? unchecked((uint)Environment.TickCount - info.Time) / 1000.0 : 0;
            }
        }
    }
}
