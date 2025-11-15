using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;
using MessageBox = System.Windows.MessageBox;
using MessageBoxButton = System.Windows.MessageBoxButton;
using MessageBoxImage = System.Windows.MessageBoxImage;
using OrchestrationDesktop.Views;

namespace OrchestrationDesktop;

public partial class App : System.Windows.Application
{
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "AI-Orchestration",
        "orchestration-desktop-error.log");

    public App()
    {
        DispatcherUnhandledException += OnDispatcherUnhandledException;
    }

    public static string OpenAiApiKey { get; private set; } = string.Empty;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        var existingKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        var originalShutdownMode = ShutdownMode;
        ShutdownMode = ShutdownMode.OnExplicitShutdown;

        var prompt = new ApiKeyPromptWindow(existingKey);

        var result = prompt.ShowDialog();
        var selectedKey = prompt.UseExistingKey ? existingKey : prompt.ApiKey;
        selectedKey = string.IsNullOrWhiteSpace(selectedKey) ? null : selectedKey.Trim();

        if (result != true || string.IsNullOrWhiteSpace(selectedKey))
        {
            ShutdownMode = originalShutdownMode;
            Shutdown();
            return;
        }

        OpenAiApiKey = selectedKey!;
        Environment.SetEnvironmentVariable("OPENAI_API_KEY", OpenAiApiKey, EnvironmentVariableTarget.Process);

        var mainWindow = new MainWindow();
        MainWindow = mainWindow;
        mainWindow.Show();

        ShutdownMode = originalShutdownMode;
    }

    private static void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        PersistException(e.Exception);

        var message = "An unexpected error occurred while launching the AI Orchestration desktop." +
                      Environment.NewLine + Environment.NewLine +
                      e.Exception.Message +
                      Environment.NewLine + Environment.NewLine +
                      $"Additional details were written to:{Environment.NewLine}{LogPath}";

        MessageBox.Show(message, "AI Orchestration", MessageBoxButton.OK, MessageBoxImage.Error);

        e.Handled = true;
        Current.Shutdown(-1);
    }

    private static void PersistException(Exception ex)
    {
        try
        {
            var directory = Path.GetDirectoryName(LogPath);
            if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.AppendAllText(
                LogPath,
                $"[{DateTime.Now:O}] {ex}{Environment.NewLine}{Environment.NewLine}");
        }
        catch
        {
            // Swallow logging failures; user will still see the message box.
        }
    }
}
