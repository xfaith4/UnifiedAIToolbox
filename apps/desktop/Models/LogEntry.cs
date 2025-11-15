using Media = System.Windows.Media;

namespace OrchestrationDesktop.Models;

public sealed class LogEntry
{
    public LogEntry(string message, LogLevel level)
    {
        Message = message;
        Level = level;
        Brush = level switch
        {
            LogLevel.Warning => Media.Brushes.DarkOrange,
            LogLevel.Error => Media.Brushes.Red,
            LogLevel.Success => Media.Brushes.ForestGreen,
            _ => Media.Brushes.LightGray
        };
    }

    public string Message { get; }
    public LogLevel Level { get; }
    public Media.Brush Brush { get; }
}

public enum LogLevel
{
    Info,
    Warning,
    Error,
    Success
}
