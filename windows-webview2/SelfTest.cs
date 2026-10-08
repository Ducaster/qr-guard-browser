using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace QrGuardLite
{
    // CI runs --self-test (security and audit-log rules) and --smoke-test (the browser engine starts) on Windows.
    internal static class SelfTest
    {
        public static int Run()
        {
            var failures = new List<string>();
            void Check(bool condition, string name)
            {
                if (!condition)
                {
                    failures.Add(name);
                }
            }

            var region = new RegionEntry();
            CodeHasher.Assign("2468", (salt, hash) =>
            {
                region.Salt = salt;
                region.Hash = hash;
            });
            Check(CodeHasher.Verify("2468", region.Salt, region.Hash), "hash accepts the code");
            Check(!CodeHasher.Verify("2469", region.Salt, region.Hash), "hash rejects another code");
            Check(!CodeHasher.Verify("", region.Salt, region.Hash), "hash rejects an empty code");

            var settings = new AppSettings();
            Lockout.RecordFailure(settings);
            Lockout.RecordFailure(settings);
            Check(Lockout.Remaining(settings) == TimeSpan.Zero, "no wait before the 3rd failure");
            Lockout.RecordFailure(settings);
            var wait = Lockout.Remaining(settings).TotalSeconds;
            Check(wait > 29 && wait <= 31, "3rd failure waits 31s");
            for (var i = 0; i < 20; i++)
            {
                Lockout.RecordFailure(settings);
            }
            Check(Lockout.Remaining(settings).TotalSeconds <= 300, "wait is capped at 5 minutes");
            Lockout.RecordSuccess(settings);
            Check(Lockout.Remaining(settings) == TimeSpan.Zero, "success clears the wait");

            var auditEvent = new AuditEvent
            {
                AppVersion = "0.1.11",
                DurationSeconds = 10,
                LockedAt = new DateTime(2026, 10, 8, 1, 2, 13, DateTimeKind.Utc),
                Reason = "timer",
                UnlockedAt = new DateTime(2026, 10, 8, 1, 2, 3, DateTimeKind.Utc),
                UserId = "=강남"
            };
            var parsed = AuditLog.Parse(AuditLog.Serialize(auditEvent));
            Check(parsed != null && parsed.UserId == auditEvent.UserId && parsed.UnlockedAt == auditEvent.UnlockedAt, "audit JSONL round-trips");
            Check(AuditLog.Parse("{broken") == null, "broken audit lines are skipped");
            var csv = AuditLog.ToCsv(new[] { auditEvent });
            Check(csv.StartsWith("\uFEFFuserId,unlockedAt,lockedAt,durationSeconds,reason,appVersion\r\n", StringComparison.Ordinal), "CSV has a BOM and CRLF header");
            Check(csv.Contains("'=강남,2026-10-08T01:02:03.000Z,2026-10-08T01:02:13.000Z,10,timer,0.1.11\r\n"), "CSV neutralizes formulas");

            foreach (var failure in failures)
            {
                Console.Error.WriteLine("FAIL " + failure);
            }

            return failures.Count;
        }

        public static int RunBrowserSmoke()
        {
            var exitCode = 1;

            using (var form = new Form { Location = new Point(-4000, -4000), ShowInTaskbar = false, Size = new Size(320, 240), StartPosition = FormStartPosition.Manual })
            using (var view = new WebView2 { Dock = DockStyle.Fill })
            using (var timeout = new Timer { Interval = 60000 })
            {
                form.Controls.Add(view);
                timeout.Tick += (sender, args) =>
                {
                    Console.Error.WriteLine("FAIL browser engine did not load a page within 60s");
                    form.Close();
                };
                form.Shown += async (sender, args) =>
                {
                    timeout.Start();

                    try
                    {
                        var environment = await CoreWebView2Environment.CreateAsync(
                            null, Path.Combine(Path.GetTempPath(), "QRGuardLite-smoke"), new CoreWebView2EnvironmentOptions(MainForm.BrowserArguments));
                        await view.EnsureCoreWebView2Async(environment);
                        view.CoreWebView2.NavigationCompleted += (navigationSender, navigation) =>
                        {
                            exitCode = navigation.IsSuccess ? 0 : 1;
                            form.Close();
                        };
                        view.CoreWebView2.NavigateToString("<p>QR Guard Lite smoke test</p>");
                    }
                    catch (Exception ex)
                    {
                        // A smoke test reports every startup failure instead of filtering types.
                        Console.Error.WriteLine("FAIL " + ex);
                        form.Close();
                    }
                };
                Application.Run(form);
            }

            return exitCode;
        }
    }
}
