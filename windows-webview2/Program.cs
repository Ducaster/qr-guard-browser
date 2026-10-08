using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace QrGuardLite
{
    internal static class Program
    {
        public const string RestartArgument = "--restarted";
        private const string RuntimeDownloadUrl = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";
        private const int RestoreWindow = 9;

        [STAThread]
        private static int Main(string[] args)
        {
            if (args.Contains("--self-test"))
            {
                return SelfTest.Run();
            }

            if (args.Contains("--smoke-test"))
            {
                Application.EnableVisualStyles();
                return SelfTest.RunBrowserSmoke();
            }

            using (var mutex = new Mutex(true, @"Local\QRGuardLite", out var created))
            {
                // Only a crash restart waits for the old process; a second launch just brings the window forward.
                if (!created && !(args.Contains(RestartArgument) && WaitForPreviousInstance(mutex)))
                {
                    FocusRunningInstance();
                    return 0;
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
                    if (!ResetBrowserData())
                    {
                        return 1;
                    }

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

        private static bool WaitForPreviousInstance(Mutex mutex)
        {
            try
            {
                return mutex.WaitOne(TimeSpan.FromSeconds(15));
            }
            catch (AbandonedMutexException)
            {
                // The previous process exited without releasing; ownership passes to us.
                return true;
            }
        }

        private static void FocusRunningInstance()
        {
            var current = Process.GetCurrentProcess();
            var window = Process.GetProcessesByName(current.ProcessName)
                .Where(process => process.Id != current.Id)
                .Select(process => process.MainWindowHandle)
                .FirstOrDefault(handle => handle != IntPtr.Zero);

            if (window == IntPtr.Zero)
            {
                return;
            }

            if (IsIconic(window))
            {
                ShowWindow(window, RestoreWindow);
            }

            SetForegroundWindow(window);
        }

        // A reset settings file must not reuse the previous operator's QR login or saved passwords.
        private static bool ResetBrowserData()
        {
            try
            {
                if (Directory.Exists(AppPaths.WebViewData))
                {
                    Directory.Delete(AppPaths.WebViewData, true);
                }

                return true;
            }
            catch (Exception ex) when (ex is IOException || ex is UnauthorizedAccessException)
            {
                MessageBox.Show("이전 브라우저 데이터를 지울 수 없습니다. 잠시 후 다시 실행하세요." + Environment.NewLine + ex.Message,
                    AppInfo.Name, MessageBoxButtons.OK, MessageBoxIcon.Error);
                return false;
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

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool IsIconic(IntPtr window);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool ShowWindow(IntPtr window, int command);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetForegroundWindow(IntPtr window);
    }
}
