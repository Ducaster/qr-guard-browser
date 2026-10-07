using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace QrGuardLite
{
    internal sealed class SettingsForm : Form
    {
        private const int MaxListedEvents = 500;
        private readonly AppSettings settings;
        private readonly CoreWebView2 core;

        public SettingsForm(AppSettings settings, CoreWebView2 core)
        {
            this.settings = settings;
            this.core = core;
            Font = Ui.Font;
            MinimizeBox = false;
            MinimumSize = new Size(Ui.S(640), Ui.S(480));
            ShowInTaskbar = false;
            Size = new Size(Ui.S(760), Ui.S(600));
            StartPosition = FormStartPosition.CenterParent;
            Text = "설정";

            var tabs = new TabControl { Dock = DockStyle.Fill };
            tabs.TabPages.Add(Page("기본", BuildGeneral()));
            tabs.TabPages.Add(Page("지역", BuildRegions()));
            tabs.TabPages.Add(Page("보안", BuildSecurity()));
            tabs.TabPages.Add(Page("이력", BuildHistory()));

            var close = Ui.Button("설정 잠그기", (sender, args) => Close());
            close.DialogResult = DialogResult.Cancel;
            var bottom = Ui.Row(close);
            bottom.Dock = DockStyle.Bottom;
            bottom.FlowDirection = FlowDirection.RightToLeft;
            bottom.Padding = new Padding(Ui.S(8));
            Controls.Add(tabs);
            Controls.Add(bottom);
            CancelButton = close;
        }

        private static TabPage Page(string title, Control content)
        {
            var page = new TabPage(title) { UseVisualStyleBackColor = true };
            page.Controls.Add(content);
            return page;
        }

        private Control BuildGeneral()
        {
            var table = Ui.Column();
            table.AutoScroll = true;
            var url = Ui.Text(settings.QrUrl);
            var unlock = Ui.Number(1, 3600, settings.UnlockSeconds);
            var idle = Ui.Number(1, 86400, settings.IdleLockSeconds);
            var autoStart = new CheckBox { AutoSize = true, Checked = AutoStart.IsEnabled(), Margin = new Padding(0, Ui.S(12), 0, 0), Text = "Windows 시작 시 자동 실행" };
            var message = Ui.Message();
            var save = Ui.Button("설정 저장", (sender, args) =>
            {
                var qrUrl = url.Text.Trim();

                if (!Ui.IsHttpUrl(qrUrl))
                {
                    Ui.ShowError(message, "QR 사이트 주소가 올바르지 않습니다.");
                    return;
                }

                settings.QrUrl = qrUrl;
                settings.UnlockSeconds = (int)unlock.Value;
                settings.IdleLockSeconds = (int)idle.Value;

                if (TrySave(message, "설정이 저장되었습니다."))
                {
                    Run(message, () => AutoStart.Set(autoStart.Checked));
                }
            }, primary: true);

            Ui.AddField(table, "QR 사이트 주소", url);
            Ui.AddField(table, "노출 시간(초)", unlock);
            Ui.AddField(table, "유휴 자동잠금(초)", idle);
            table.Controls.Add(autoStart);
            table.Controls.Add(Ui.Row(save));
            table.Controls.Add(message);
            return table;
        }

        private Control BuildRegions()
        {
            var table = Ui.Column();
            var list = Ui.List(("지역", 220), ("마지막 인증", 200));
            var message = Ui.Message();

            void RefreshList()
            {
                var lastUnlocks = LastUnlockByRegion(AuditLog.ReadAll());
                list.BeginUpdate();
                list.Items.Clear();

                foreach (var region in settings.Regions)
                {
                    var last = lastUnlocks.TryGetValue(region.Id, out var at) ? Ui.Local(at) : "기록 없음";
                    list.Items.Add(new ListViewItem(new[] { region.Id, last }) { Tag = region });
                }

                list.EndUpdate();
            }

            RegionEntry Selected()
            {
                if (list.SelectedItems.Count == 0)
                {
                    Ui.ShowError(message, "지역을 선택하세요.");
                    return null;
                }

                return (RegionEntry)list.SelectedItems[0].Tag;
            }

            var add = Ui.Button("추가", (sender, args) =>
            {
                var values = InputDialog.Show(this, "지역 추가", new InputField("지역 이름"), new InputField("인증 코드", secret: true));

                if (values == null)
                {
                    return;
                }

                var error = Validation.RegionName(values[0], settings.Regions, null) ?? Validation.Code(values[1], "인증 코드");
                if (error != null)
                {
                    Ui.ShowError(message, error);
                    return;
                }

                var entry = new RegionEntry { Id = values[0].Trim() };
                SetCode(entry, values[1]);
                settings.Regions.Add(entry);
                TrySave(message, "지역이 추가되었습니다.");
                RefreshList();
            }, primary: true);
            var rename = Ui.Button("이름 변경", (sender, args) =>
            {
                var entry = Selected();
                var values = entry == null ? null : InputDialog.Show(this, "지역 이름 변경", new InputField("지역 이름", value: entry.Id));

                if (values == null)
                {
                    return;
                }

                var error = Validation.RegionName(values[0], settings.Regions, entry);
                if (error != null)
                {
                    Ui.ShowError(message, error);
                    return;
                }

                if (settings.LastRegion == entry.Id)
                {
                    settings.LastRegion = values[0].Trim();
                }

                entry.Id = values[0].Trim();
                TrySave(message, "지역 이름이 변경되었습니다.");
                RefreshList();
            });
            var reset = Ui.Button("코드 재설정", (sender, args) =>
            {
                var entry = Selected();
                var values = entry == null ? null : InputDialog.Show(this, entry.Id + " 코드 재설정", new InputField("새 인증 코드", secret: true));

                if (values == null)
                {
                    return;
                }

                var error = Validation.Code(values[0], "인증 코드");
                if (error != null)
                {
                    Ui.ShowError(message, error);
                    return;
                }

                SetCode(entry, values[0]);
                TrySave(message, "인증 코드가 변경되었습니다.");
            });
            var delete = Ui.Button("삭제", (sender, args) =>
            {
                var entry = Selected();

                if (entry == null)
                {
                    return;
                }

                if (settings.Regions.Count == 1)
                {
                    Ui.ShowError(message, "지역은 최소 1개 이상 필요합니다.");
                    return;
                }

                if (Confirm(entry.Id + " 지역을 삭제할까요?"))
                {
                    settings.Regions.Remove(entry);
                    TrySave(message, "지역이 삭제되었습니다.");
                    RefreshList();
                }
            });

            table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            table.Controls.Add(list);
            table.Controls.Add(Ui.Row(add, rename, reset, delete));
            table.Controls.Add(message);
            RefreshList();
            return table;
        }

        private Control BuildSecurity()
        {
            var table = Ui.Column();
            table.AutoScroll = true;
            var code = Ui.Text(secret: true);
            var confirm = Ui.Text(secret: true);
            var message = Ui.Message();
            var change = Ui.Button("관리자 코드 변경", (sender, args) =>
            {
                var error = Validation.Code(code.Text, "관리자 코드") ??
                    (code.Text == confirm.Text ? null : "관리자 코드 확인이 일치하지 않습니다.");

                if (error != null)
                {
                    Ui.ShowError(message, error);
                    return;
                }

                CodeHasher.Assign(code.Text, (salt, hash) =>
                {
                    settings.AdminSalt = salt;
                    settings.AdminHash = hash;
                });

                if (TrySave(message, "관리자 코드가 변경되었습니다."))
                {
                    code.Clear();
                    confirm.Clear();
                }
            }, primary: true);
            var clearSession = Ui.Button("QR 사이트 로그인 세션 초기화", async (sender, args) =>
            {
                if (Confirm("QR 사이트의 쿠키와 저장 데이터를 지웁니다. 다시 로그인해야 합니다. 계속할까요?") &&
                    await ClearBrowsingData(message, CoreWebView2BrowsingDataKinds.AllSite | CoreWebView2BrowsingDataKinds.DiskCache, "QR 사이트 세션을 초기화했습니다."))
                {
                    core.Navigate(settings.QrUrl);
                }
            });
            var clearPasswords = Ui.Button("저장된 비밀번호 모두 지우기", async (sender, args) =>
            {
                if (Confirm("브라우저에 저장된 비밀번호를 모두 지울까요?"))
                {
                    await ClearBrowsingData(message, CoreWebView2BrowsingDataKinds.PasswordAutosave, "저장된 비밀번호를 지웠습니다.");
                }
            });

            table.Controls.Add(Ui.Caption("관리자 코드", bold: true));
            Ui.AddField(table, "새 관리자 코드", code);
            Ui.AddField(table, "새 관리자 코드 확인", confirm);
            table.Controls.Add(Ui.Row(change));
            table.Controls.Add(Ui.Caption("브라우저 데이터", bold: true));
            table.Controls.Add(Ui.Row(clearSession, clearPasswords));
            table.Controls.Add(message);
            return table;
        }

        private Control BuildHistory()
        {
            var table = Ui.Column();
            var from = new DateTimePicker { Format = DateTimePickerFormat.Short, Value = DateTime.Today.AddDays(-6), Width = Ui.S(130) };
            var to = new DateTimePicker { Format = DateTimePickerFormat.Short, Value = DateTime.Today, Width = Ui.S(130) };
            var region = new ComboBox { DropDownStyle = ComboBoxStyle.DropDownList, Width = Ui.S(160) };
            var stats = Ui.List(("지역", 200), ("인증 횟수", 100), ("기간 내 마지막 인증", 200));
            var events = Ui.List(("지역", 140), ("해제 시각", 160), ("잠금 시각", 160), ("시간(초)", 70), ("사유", 100));
            var summary = Ui.Message();
            var filtered = new List<AuditEvent>();

            region.Items.Add("전체 지역");
            region.Items.AddRange(settings.Regions.Select(entry => (object)entry.Id).ToArray());
            region.SelectedIndex = 0;

            void Query()
            {
                var start = from.Value.Date.ToUniversalTime();
                var end = to.Value.Date.AddDays(1).ToUniversalTime();
                var regionFilter = region.SelectedIndex > 0 ? (string)region.SelectedItem : null;
                filtered = AuditLog.ReadAll()
                    .Where(e => e.UnlockedAt >= start && e.UnlockedAt < end && (regionFilter == null || e.UserId == regionFilter))
                    .ToList();

                stats.BeginUpdate();
                stats.Items.Clear();
                foreach (var group in filtered.Where(e => e.UserId != AppInfo.AdminAuditUser).GroupBy(e => e.UserId).OrderByDescending(g => g.Count()))
                {
                    stats.Items.Add(new ListViewItem(new[] { group.Key, group.Count().ToString(), Ui.Local(group.Max(e => e.UnlockedAt)) }));
                }
                stats.EndUpdate();

                events.BeginUpdate();
                events.Items.Clear();
                foreach (var e in Enumerable.Reverse(filtered).Take(MaxListedEvents))
                {
                    events.Items.Add(new ListViewItem(new[] { e.UserId, Ui.Local(e.UnlockedAt), Ui.Local(e.LockedAt), e.DurationSeconds.ToString(), ReasonLabel(e.Reason) }));
                }
                events.EndUpdate();

                var unlocks = filtered.Count(e => e.UserId != AppInfo.AdminAuditUser);
                summary.Text = $"지역 인증 {unlocks}건 · 전체 기록 {filtered.Count}건" +
                    (filtered.Count > MaxListedEvents ? $" (최근 {MaxListedEvents}건 표시)" : "");
            }

            var query = Ui.Button("조회", (sender, args) => Query(), primary: true);
            var export = Ui.Button("CSV 내보내기", (sender, args) =>
            {
                using (var dialog = new SaveFileDialog { FileName = $"qr-guard-audit-{from.Value:yyyyMMdd}-{to.Value:yyyyMMdd}.csv", Filter = "CSV 파일 (*.csv)|*.csv" })
                {
                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        Run(summary, () => File.WriteAllText(dialog.FileName, AuditLog.ToCsv(filtered), new UTF8Encoding(false)));
                    }
                }
            });

            table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            table.RowStyles.Add(new RowStyle(SizeType.Absolute, Ui.S(150)));
            table.RowStyles.Add(new RowStyle(SizeType.AutoSize));
            table.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
            table.Controls.Add(Ui.Row(new Label { AutoSize = true, Anchor = AnchorStyles.Left, Text = "기간" }, from, new Label { AutoSize = true, Text = "~" }, to, region, query, export));
            table.Controls.Add(Ui.Caption("지역별 인증 횟수", bold: true));
            table.Controls.Add(stats);
            table.Controls.Add(summary);
            table.Controls.Add(events);
            Query();
            return table;
        }

        private static Dictionary<string, DateTime> LastUnlockByRegion(IEnumerable<AuditEvent> events) =>
            events.Where(e => e.UserId != AppInfo.AdminAuditUser)
                .GroupBy(e => e.UserId)
                .ToDictionary(g => g.Key, g => g.Max(e => e.UnlockedAt));

        private static string ReasonLabel(string reason)
        {
            switch (reason)
            {
                case "timer":
                    return "시간 만료";
                case "idle":
                    return "유휴 잠금";
                case "manual":
                    return "수동 잠금";
                case "qr-title":
                    return "QR 화면 확인";
                default:
                    return reason;
            }
        }

        private static void SetCode(RegionEntry entry, string code) =>
            CodeHasher.Assign(code, (salt, hash) =>
            {
                entry.Salt = salt;
                entry.Hash = hash;
            });

        private bool Confirm(string text) =>
            MessageBox.Show(this, text, Text, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes;

        private bool TrySave(Label message, string done) =>
            Run(message, () => SettingsStore.Save(settings), done);

        private static bool Run(Label message, Action action, string done = null)
        {
            try
            {
                action();

                if (done != null)
                {
                    Ui.ShowOk(message, done);
                }

                return true;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException || ex is CryptographicException || ex is SecurityException)
            {
                Ui.ShowError(message, "저장할 수 없습니다: " + ex.Message);
                return false;
            }
        }

        private async Task<bool> ClearBrowsingData(Label message, CoreWebView2BrowsingDataKinds kinds, string done)
        {
            if (core == null)
            {
                Ui.ShowError(message, "브라우저가 아직 준비되지 않았습니다.");
                return false;
            }

            try
            {
                await core.Profile.ClearBrowsingDataAsync(kinds);
                Ui.ShowOk(message, done);
                return true;
            }
            catch (Exception ex) when (ex is NotImplementedException || ex is InvalidCastException || ex is COMException)
            {
                Ui.ShowError(message, "WebView2 런타임을 업데이트한 뒤 다시 시도하세요.");
                return false;
            }
        }
    }
}
