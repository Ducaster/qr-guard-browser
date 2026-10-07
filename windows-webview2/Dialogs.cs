using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.Linq;
using System.Windows.Forms;

namespace QrGuardLite
{
    internal static class Ui
    {
        public static readonly Font Font = new Font("Malgun Gothic", 9F);
        public static readonly Color Primary = Color.FromArgb(0, 95, 184);
        private static readonly float ScaleFactor = ReadScale();

        public static int S(int pixels) => (int)Math.Round(pixels * ScaleFactor);

        public static bool IsHttpUrl(string value) =>
            Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
            (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps);

        public static TableLayoutPanel Column(bool autoSize = false)
        {
            var table = new TableLayoutPanel
            {
                ColumnCount = 1,
                Padding = new Padding(S(16)),
                AutoSize = autoSize,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Dock = autoSize ? DockStyle.None : DockStyle.Fill
            };
            table.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            return table;
        }

        public static void AddField(TableLayoutPanel table, string label, Control field)
        {
            table.Controls.Add(Caption(label));
            table.Controls.Add(field);
        }

        public static Label Caption(string text, bool bold = false) => new Label
        {
            AutoSize = true,
            Font = bold ? new Font(Font, FontStyle.Bold) : Font,
            Margin = new Padding(0, S(8), 0, S(2)),
            Text = text
        };

        public static Button Button(string text, EventHandler onClick, bool primary = false)
        {
            var button = new Button
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Margin = new Padding(0, S(4), S(8), S(4)),
                MinimumSize = new Size(0, S(30)),
                Padding = new Padding(S(8), 0, S(8), 0),
                Text = text,
                UseVisualStyleBackColor = !primary
            };

            if (primary)
            {
                button.FlatStyle = FlatStyle.Flat;
                button.BackColor = Primary;
                button.ForeColor = Color.White;
                button.FlatAppearance.BorderColor = Primary;
            }

            button.Click += onClick;
            return button;
        }

        public static FlowLayoutPanel Row(params Control[] controls)
        {
            var row = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true, Margin = new Padding(0, S(6), 0, 0) };
            row.Controls.AddRange(controls);
            return row;
        }

        public static TextBox Text(string value = "", bool secret = false) =>
            new TextBox { Anchor = AnchorStyles.Left | AnchorStyles.Right, Text = value, UseSystemPasswordChar = secret, Width = S(280) };

        public static NumericUpDown Number(int min, int max, int value) => new NumericUpDown
        {
            Maximum = max,
            Minimum = min,
            Value = Math.Max(min, Math.Min(max, value)),
            Width = S(120)
        };

        public static Label Message() => new Label { AutoSize = true, MaximumSize = new Size(S(560), 0), Margin = new Padding(0, S(6), 0, 0) };

        public static void ShowOk(Label label, string text)
        {
            label.ForeColor = Color.FromArgb(16, 124, 16);
            label.Text = text;
        }

        public static void ShowError(Label label, string text)
        {
            label.ForeColor = Color.Firebrick;
            label.Text = text;
        }

        public static ListView List(params (string Title, int Width)[] columns)
        {
            var list = new ListView { Dock = DockStyle.Fill, FullRowSelect = true, HideSelection = false, MultiSelect = false, View = View.Details };

            foreach (var column in columns)
            {
                list.Columns.Add(column.Title, S(column.Width));
            }

            return list;
        }

        public static string Local(DateTime utc) =>
            utc.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);

        private static float ReadScale()
        {
            using (var graphics = Graphics.FromHwnd(IntPtr.Zero))
            {
                return graphics.DpiX / 96F;
            }
        }
    }

    internal static class Validation
    {
        public static string Code(string code, string label) =>
            code.Length < AppInfo.CodeMinLength ? $"{label}는 최소 {AppInfo.CodeMinLength}자 이상이어야 합니다." : null;

        public static string RegionName(string name, IEnumerable<RegionEntry> regions, RegionEntry except)
        {
            var trimmed = name.Trim();

            if (trimmed.Length == 0)
            {
                return "지역 이름을 입력하세요.";
            }

            if (trimmed == AppInfo.AdminAuditUser)
            {
                return "'관리자'는 지역 이름으로 쓸 수 없습니다.";
            }

            return regions.Any(region => region != except && region.Id == trimmed) ? "이미 있는 지역 이름입니다." : null;
        }
    }

    internal sealed class InputField
    {
        public InputField(string label, bool secret = false, string value = "")
        {
            Label = label;
            Secret = secret;
            Value = value;
        }

        public string Label { get; }
        public bool Secret { get; }
        public string Value { get; }
    }

    internal static class InputDialog
    {
        public static string[] Show(IWin32Window owner, string title, params InputField[] fields)
        {
            using (var form = NewDialog(title))
            {
                var table = Ui.Column(autoSize: true);
                var boxes = new List<TextBox>();

                foreach (var field in fields)
                {
                    var box = Ui.Text(field.Value, field.Secret);
                    boxes.Add(box);
                    Ui.AddField(table, field.Label, box);
                }

                var ok = new Button { AutoSize = true, DialogResult = DialogResult.OK, Text = "확인" };
                var cancel = new Button { AutoSize = true, DialogResult = DialogResult.Cancel, Text = "취소" };
                var buttons = Ui.Row(cancel, ok);
                buttons.FlowDirection = FlowDirection.RightToLeft;
                table.Controls.Add(buttons);
                form.Controls.Add(table);
                form.AcceptButton = ok;
                form.CancelButton = cancel;

                return form.ShowDialog(owner) == DialogResult.OK ? boxes.Select(box => box.Text).ToArray() : null;
            }
        }

        public static Form NewDialog(string title) => new Form
        {
            AutoSize = true,
            AutoSizeMode = AutoSizeMode.GrowAndShrink,
            Font = Ui.Font,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            ShowInTaskbar = false,
            StartPosition = FormStartPosition.CenterParent,
            Text = title
        };
    }

    internal sealed class SetupForm : Form
    {
        private readonly AppSettings settings;
        private readonly TextBox qrUrl = Ui.Text("https://");
        private readonly TextBox adminCode = Ui.Text(secret: true);
        private readonly TextBox adminConfirm = Ui.Text(secret: true);
        private readonly TextBox region = Ui.Text();
        private readonly TextBox regionCode = Ui.Text(secret: true);
        private readonly Label message = Ui.Message();

        public SetupForm(AppSettings settings)
        {
            this.settings = settings;
            AutoSize = true;
            AutoSizeMode = AutoSizeMode.GrowAndShrink;
            Font = Ui.Font;
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Text = AppInfo.Name + " 초기 설정";

            var table = Ui.Column(autoSize: true);
            qrUrl.Width = Ui.S(360);
            Ui.AddField(table, "QR 사이트 주소", qrUrl);
            Ui.AddField(table, "관리자 코드", adminCode);
            Ui.AddField(table, "관리자 코드 확인", adminConfirm);
            Ui.AddField(table, "첫 지역 이름", region);
            Ui.AddField(table, "지역 인증 코드", regionCode);
            table.Controls.Add(message);
            var submit = Ui.Button("설정 완료", (sender, args) => Submit(), primary: true);
            table.Controls.Add(Ui.Row(submit));
            Controls.Add(table);
            AcceptButton = submit;
        }

        private void Submit()
        {
            var errors = new List<string>();
            var url = qrUrl.Text.Trim();

            if (!Ui.IsHttpUrl(url))
            {
                errors.Add("QR 사이트 주소가 올바르지 않습니다.");
            }

            var adminError = Validation.Code(adminCode.Text, "관리자 코드");
            if (adminError != null)
            {
                errors.Add(adminError);
            }
            else if (adminCode.Text != adminConfirm.Text)
            {
                errors.Add("관리자 코드 확인이 일치하지 않습니다.");
            }

            var regionError = Validation.RegionName(region.Text, Enumerable.Empty<RegionEntry>(), null) ??
                Validation.Code(regionCode.Text, "인증 코드");
            if (regionError != null)
            {
                errors.Add(regionError);
            }

            if (errors.Count > 0)
            {
                Ui.ShowError(message, string.Join(Environment.NewLine, errors));
                return;
            }

            settings.QrUrl = url;
            CodeHasher.Assign(adminCode.Text, (salt, hash) =>
            {
                settings.AdminSalt = salt;
                settings.AdminHash = hash;
            });
            var entry = new RegionEntry { Id = region.Text.Trim() };
            CodeHasher.Assign(regionCode.Text, (salt, hash) =>
            {
                entry.Salt = salt;
                entry.Hash = hash;
            });
            settings.Regions = new List<RegionEntry> { entry };
            SettingsStore.Save(settings);
            DialogResult = DialogResult.OK;
        }
    }
}
