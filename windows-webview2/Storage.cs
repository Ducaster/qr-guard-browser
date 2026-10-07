using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

namespace QrGuardLite
{
    internal static class AppInfo
    {
        public const string Name = "QR Guard Lite";
        public const string AdminAuditUser = "관리자";
        public const int CodeMinLength = 4;
        public static readonly string Version = typeof(AppInfo).Assembly.GetName().Version.ToString(3);
    }

    internal static class AppPaths
    {
        public static readonly string Root = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "QRGuardLite");
        public static readonly string Settings = Path.Combine(Root, "settings.dat");
        public static readonly string AuditLog = Path.Combine(Root, "audit-log.jsonl");
        public static readonly string AuditLogRotated = Path.Combine(Root, "audit-log.1.jsonl");
        public static readonly string WebViewData = Path.Combine(Root, "WebView2");
    }

    public sealed class RegionEntry
    {
        public string Id { get; set; } = "";
        public string Salt { get; set; } = "";
        public string Hash { get; set; } = "";
    }

    public sealed class AppSettings
    {
        public string QrUrl { get; set; } = "";
        public int UnlockSeconds { get; set; } = 10;
        public int IdleLockSeconds { get; set; } = 30;
        public string AdminSalt { get; set; } = "";
        public string AdminHash { get; set; } = "";
        public List<RegionEntry> Regions { get; set; } = new List<RegionEntry>();
        public string LastRegion { get; set; } = "";
        public int FailedAttempts { get; set; }
        public long LockoutUntilTicks { get; set; }
        public string WindowBounds { get; set; } = "";

        [ScriptIgnore]
        public bool IsConfigured => AdminHash.Length > 0;
    }

    internal static class SettingsStore
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("QRGuardLite.settings.v1");

        public static AppSettings Load()
        {
            foreach (var path in new[] { AppPaths.Settings, AppPaths.Settings + ".bak" })
            {
                try
                {
                    if (!File.Exists(path))
                    {
                        continue;
                    }

                    var json = Encoding.UTF8.GetString(
                        ProtectedData.Unprotect(File.ReadAllBytes(path), Entropy, DataProtectionScope.CurrentUser));
                    var settings = new JavaScriptSerializer().Deserialize<AppSettings>(json);

                    if (settings != null)
                    {
                        settings.Regions = settings.Regions ?? new List<RegionEntry>();
                        return settings;
                    }
                }
                catch (Exception ex) when (ex is CryptographicException || ex is IOException || ex is ArgumentException || ex is InvalidOperationException)
                {
                    // Fall through to the backup copy.
                }
            }

            return new AppSettings();
        }

        public static void Save(AppSettings settings)
        {
            Directory.CreateDirectory(AppPaths.Root);
            var data = ProtectedData.Protect(
                Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(settings)), Entropy, DataProtectionScope.CurrentUser);
            var temp = AppPaths.Settings + ".tmp";

            File.WriteAllBytes(temp, data);

            if (File.Exists(AppPaths.Settings))
            {
                File.Replace(temp, AppPaths.Settings, AppPaths.Settings + ".bak");
            }
            else
            {
                File.Move(temp, AppPaths.Settings);
            }
        }
    }

    internal static class CodeHasher
    {
        private const int Iterations = 100000;

        public static void Assign(string code, Action<string, string> assign)
        {
            var salt = new byte[16];

            using (var random = RandomNumberGenerator.Create())
            {
                random.GetBytes(salt);
            }

            assign(Convert.ToBase64String(salt), Convert.ToBase64String(Derive(code, salt)));
        }

        public static bool Verify(string code, string salt, string hash)
        {
            if (code.Length == 0 || salt.Length == 0 || hash.Length == 0)
            {
                return false;
            }

            var expected = Convert.FromBase64String(hash);
            var actual = Derive(code, Convert.FromBase64String(salt));
            var difference = expected.Length ^ actual.Length;

            for (var i = 0; i < Math.Min(expected.Length, actual.Length); i++)
            {
                difference |= expected[i] ^ actual[i];
            }

            return difference == 0;
        }

        private static byte[] Derive(string code, byte[] salt)
        {
            using (var kdf = new Rfc2898DeriveBytes(code, salt, Iterations, HashAlgorithmName.SHA256))
            {
                return kdf.GetBytes(32);
            }
        }
    }

    // Mirrors the Electron build: from the 3rd failure wait 30s + 2^(n-3)s, capped at 5 minutes.
    internal static class Lockout
    {
        public static TimeSpan Remaining(AppSettings settings)
        {
            var remaining = new DateTime(settings.LockoutUntilTicks, DateTimeKind.Utc) - DateTime.UtcNow;

            return remaining > TimeSpan.Zero ? remaining : TimeSpan.Zero;
        }

        public static void RecordFailure(AppSettings settings)
        {
            settings.FailedAttempts++;

            if (settings.FailedAttempts >= 3)
            {
                var exponent = Math.Min(20, settings.FailedAttempts - 3);
                var delayMs = Math.Min(30000 + 1000.0 * Math.Pow(2, exponent), 300000);
                settings.LockoutUntilTicks = DateTime.UtcNow.AddMilliseconds(delayMs).Ticks;
            }
        }

        public static void RecordSuccess(AppSettings settings)
        {
            settings.FailedAttempts = 0;
            settings.LockoutUntilTicks = 0;
        }

        public static string RetryMessage(TimeSpan remaining) =>
            $"{Math.Ceiling(remaining.TotalSeconds):0}초 후 다시 시도하세요.";
    }

    internal sealed class AuditEvent
    {
        public string UserId { get; set; } = "";
        public DateTime UnlockedAt { get; set; }
        public DateTime LockedAt { get; set; }
        public int DurationSeconds { get; set; }
        public string Reason { get; set; } = "";
        public string AppVersion { get; set; } = "";
    }

    // Same JSONL/CSV shape as the Electron build so logs can be copied between them.
    internal static class AuditLog
    {
        private const long RotateBytes = 5 * 1024 * 1024;
        private static readonly string[] CsvFields = { "userId", "unlockedAt", "lockedAt", "durationSeconds", "reason", "appVersion" };
        private static readonly JavaScriptSerializer Serializer = new JavaScriptSerializer();

        public static void Append(AuditEvent auditEvent)
        {
            Directory.CreateDirectory(AppPaths.Root);
            var info = new FileInfo(AppPaths.AuditLog);

            if (info.Exists && info.Length > RotateBytes)
            {
                File.Delete(AppPaths.AuditLogRotated);
                File.Move(AppPaths.AuditLog, AppPaths.AuditLogRotated);
            }

            File.AppendAllText(AppPaths.AuditLog, Serialize(auditEvent) + "\n", new UTF8Encoding(false));
        }

        public static string Serialize(AuditEvent auditEvent) => Serializer.Serialize(ToFields(auditEvent));

        public static List<AuditEvent> ReadAll()
        {
            var events = new List<AuditEvent>();

            foreach (var path in new[] { AppPaths.AuditLogRotated, AppPaths.AuditLog }.Where(File.Exists))
            {
                foreach (var line in File.ReadLines(path, Encoding.UTF8))
                {
                    var parsed = Parse(line);

                    if (parsed != null)
                    {
                        events.Add(parsed);
                    }
                }
            }

            return events.OrderBy(e => e.UnlockedAt).ToList();
        }

        public static string ToCsv(IEnumerable<AuditEvent> events)
        {
            var builder = new StringBuilder("\uFEFF");
            builder.Append(string.Join(",", CsvFields)).Append("\r\n");

            foreach (var auditEvent in events)
            {
                var fields = ToFields(auditEvent);
                builder.Append(string.Join(",", CsvFields.Select(field => EscapeCsv(Convert.ToString(fields[field], CultureInfo.InvariantCulture)))));
                builder.Append("\r\n");
            }

            return builder.ToString();
        }

        public static string FormatIso(DateTime value) =>
            value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);

        private static Dictionary<string, object> ToFields(AuditEvent auditEvent) => new Dictionary<string, object>
        {
            ["userId"] = auditEvent.UserId,
            ["unlockedAt"] = FormatIso(auditEvent.UnlockedAt),
            ["lockedAt"] = FormatIso(auditEvent.LockedAt),
            ["durationSeconds"] = auditEvent.DurationSeconds,
            ["reason"] = auditEvent.Reason,
            ["appVersion"] = auditEvent.AppVersion
        };

        public static AuditEvent Parse(string line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                return null;
            }

            try
            {
                var fields = Serializer.Deserialize<Dictionary<string, object>>(line);

                return new AuditEvent
                {
                    UserId = (string)fields["userId"],
                    UnlockedAt = ParseIso((string)fields["unlockedAt"]),
                    LockedAt = ParseIso((string)fields["lockedAt"]),
                    DurationSeconds = Convert.ToInt32(fields["durationSeconds"], CultureInfo.InvariantCulture),
                    Reason = (string)fields["reason"],
                    AppVersion = (string)fields["appVersion"]
                };
            }
            catch (Exception ex) when (ex is ArgumentException || ex is InvalidOperationException || ex is InvalidCastException || ex is FormatException || ex is KeyNotFoundException || ex is NullReferenceException || ex is OverflowException)
            {
                return null;
            }
        }

        private static DateTime ParseIso(string value) =>
            DateTime.Parse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal);

        private static string EscapeCsv(string value)
        {
            // Neutralize spreadsheet formulas the same way the Electron export does.
            var safe = value.Length > 0 && "\t\r=+-@".IndexOf(value[0]) >= 0 ? "'" + value : value;

            return safe.IndexOfAny(new[] { '"', ',', '\n', '\r' }) >= 0 ? "\"" + safe.Replace("\"", "\"\"") + "\"" : safe;
        }
    }

    internal static class AutoStart
    {
        private const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        private const string ValueName = "QRGuardLite";

        public static bool IsEnabled()
        {
            using (var key = Registry.CurrentUser.OpenSubKey(RunKey))
            {
                return key?.GetValue(ValueName) is string;
            }
        }

        public static void Set(bool enabled)
        {
            using (var key = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (enabled)
                {
                    key.SetValue(ValueName, "\"" + Application.ExecutablePath + "\"");
                }
                else
                {
                    key.DeleteValue(ValueName, false);
                }
            }
        }
    }
}
