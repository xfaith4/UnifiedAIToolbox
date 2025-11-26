using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace OrchestrationDesktop.Views;

public partial class HelpWindow : Window
{
    private readonly string _docsPath;

    public HelpWindow()
    {
        InitializeComponent();
        
        // Get the path to the docs/help directory
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var repoRoot = FindRepoRoot(baseDir);
        _docsPath = repoRoot != null 
            ? Path.Combine(repoRoot, "docs", "help")
            : Path.Combine(baseDir, "docs", "help");
            
        // Show overview by default
        ShowOverview();
    }

    private string? FindRepoRoot(string startDir)
    {
        var dir = new DirectoryInfo(startDir);
        while (dir != null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "docs", "help")))
                return dir.FullName;
            if (Directory.Exists(Path.Combine(dir.FullName, ".git")))
                return dir.FullName;
            dir = dir.Parent;
        }
        return null;
    }

    private void OnNavigate(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string docName)
        {
            ShowDocumentation(docName);
        }
    }

    private void ShowOverview()
    {
        // The overview content is already in the XAML, just keep it visible
        // In a full implementation, you could load index.md here
    }

    private void ShowDocumentation(string docName)
    {
        var docPath = Path.Combine(_docsPath, $"{docName}.md");
        
        if (File.Exists(docPath))
        {
            try
            {
                // Open in the default markdown viewer (e.g., VS Code, Notepad)
                Process.Start(new ProcessStartInfo
                {
                    FileName = docPath,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Unable to open documentation file:\n{docPath}\n\nError: {ex.Message}",
                    "Documentation Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Warning);
            }
        }
        else
        {
            MessageBox.Show(
                $"Documentation file not found:\n{docPath}\n\nPlease ensure the documentation is installed.",
                "Documentation Not Found",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void OnOpenDocsFolder(object sender, RoutedEventArgs e)
    {
        if (Directory.Exists(_docsPath))
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = _docsPath,
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Unable to open docs folder:\n{_docsPath}\n\nError: {ex.Message}",
                    "Error",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }
        else
        {
            MessageBox.Show(
                $"Documentation folder not found:\n{_docsPath}",
                "Folder Not Found",
                MessageBoxButton.OK,
                MessageBoxImage.Warning);
        }
    }

    private void OnOpenOnlineHelp(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "https://github.com/xfaith4/UnifiedAIToolbox/tree/main/docs/help",
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Unable to open online help:\n\nError: {ex.Message}",
                "Error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
        }
    }
}
