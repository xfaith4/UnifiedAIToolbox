using System.Diagnostics;
using System.IO;

var launcherDirectory = Path.GetDirectoryName(Environment.ProcessPath) ?? AppContext.BaseDirectory;
var repoRoot = FindRepoRoot(launcherDirectory) ?? launcherDirectory;
var publishPath = Path.Combine(repoRoot, "apps", "OrchestrationDesktop", "bin", "Release", "net8.0-windows", "win-x64", "publish");
var exePath = Path.Combine(publishPath, "OrchestrationDesktop.exe");

if (!File.Exists(exePath))
{
    Console.Error.WriteLine($"Could not find OrchestrationDesktop build output at '{exePath}'. Run the publish step first.");
    return 1;
}

var startInfo = new ProcessStartInfo(exePath)
{
    WorkingDirectory = publishPath,
    UseShellExecute = true
};

try
{
    using var process = Process.Start(startInfo);
    if (process is null)
    {
        Console.Error.WriteLine("Failed to start OrchestrationDesktop.");
        return 1;
    }
}
catch (Exception ex)
{
    Console.Error.WriteLine($"Failed to launch OrchestrationDesktop: {ex.Message}");
    return 1;
}

return 0;

static string? FindRepoRoot(string startPath)
{
    var directory = new DirectoryInfo(startPath);
    while (directory is not null)
    {
        var slnPath = Path.Combine(directory.FullName, "UnifiedAIToolbox.sln");
        if (File.Exists(slnPath))
        {
            return directory.FullName;
        }

        directory = directory.Parent;
    }

    return null;
}
