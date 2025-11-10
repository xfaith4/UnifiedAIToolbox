using System;
using System.IO;
using System.Text.Json;

namespace OrchestrationDesktop.Services;

public sealed class SettingsService
{
    private const string SettingsFileName = "settings.json";
    private readonly string _settingsPath;

    public SettingsService(string appName = "OrchestrationDesktop")
    {
        var root = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        _settingsPath = Path.Combine(root, appName, SettingsFileName);
    }

    public UserSettings Load()
    {
        try
        {
            if (!File.Exists(_settingsPath))
            {
                return new UserSettings();
            }

            var json = File.ReadAllText(_settingsPath);
            var settings = JsonSerializer.Deserialize<UserSettings>(json);
            return settings ?? new UserSettings();
        }
        catch
        {
            return new UserSettings();
        }
    }

    public void Save(UserSettings settings)
    {
        var directory = Path.GetDirectoryName(_settingsPath);
        if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        File.WriteAllText(_settingsPath, json);
    }
}

public sealed class UserSettings
{
    public string? RepoRoot { get; set; }
    public string? GoalFile { get; set; }
    public string Model { get; set; } = "gpt-5";
    public string ModelInstruction { get; set; } = string.Empty;
    public string? PromptId { get; set; }
    public string CustomPromptText { get; set; } = string.Empty;
    public string? AgentId { get; set; }
    public bool AutoSelectAgent { get; set; } = true;
    public int MaxIterations { get; set; } = 3;
    public int PassThreshold { get; set; } = 7;
    public bool SkipContextResolution { get; set; }
    public bool SkipCodex { get; set; }
    public string CodexModel { get; set; } = "gpt-5-codex";
    public string CodexInstruction { get; set; } = string.Empty;
    public bool UseWslForCodex { get; set; }
    public int MaxParallel { get; set; } = 3;
    public string WorkDir { get; set; } = ".codex_out";
}
