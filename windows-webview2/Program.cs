using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace QrGuardLite
{
    internal static class Program
    {
        private const string RuntimeDownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Contains("--self-test"))
            {
                return SelfTest.Run();
            }

            using (new Mutex(true, @"Local\QRGuardLite", out var created))
            {
                if (!created)
                {
                    MessageBox.Show("QR Guard Lite가 이미 실행 중입니다.", AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 1;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += (sender, args) => ReportError(args.Exception);

                if (!IsRuntimeInstalled())
                {
                    var answer = MessageBox.Show(
                        "Microsoft Edge WebView2 런타임이 필요합니다." + Environment.NewLine + "설치 페이지를 열까요?",
                        AppInfo.Name, MessageBoxButtons.YesNo, MessageBoxIcon.Warning);

                    if (answer == DialogResult.Yes)
                    {
                        Process.Start(RuntimeDownloadUrl);
                    }

                    return 1;
                }

                var settings = SettingsStore.Load();

                if (!settings.IsConfigured)
                {
                    using (var setup = new SetupForm(settings))
                    {
                        if (setup.ShowDialog() != DialogResult.OK)
                        {
                            return 0;
                        }
                    }
                }

                Application.Run(new MainForm(settings));
                return 0;
            }
        }

        private static bool IsRuntimeInstalled()
        {
            try
            {
                return !string.IsNullOrEmpty(CoreWebView2Environment.GetAvailableBrowserVersionString());
            }
            catch (WebView2RuntimeNotFoundException)
            {
                return false;
            }
        }

        // Keep the guard window alive after unexpected UI errors instead of crashing to the desktop.
        private static void ReportError(Exception error)
        {
            try
            {
                Directory.CreateDirectory(AppPaths.Root);
                File.AppendAllText(Path.Combine(AppPaths.Root, "error.log"), $"{DateTime.Now:O} {error}{Environment.NewLine}");
            }
            catch (IOException)
            {
                // Nothing else to do if the log itself is unwritable.
            }

            MessageBox.Show("예기치 않은 오류가 발생했습니다." + Environment.NewLine + error.Message, AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
