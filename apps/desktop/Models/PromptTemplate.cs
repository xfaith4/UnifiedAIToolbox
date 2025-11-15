using System;

namespace OrchestrationDesktop.Models;

public sealed class PromptTemplate
{
    public string Id { get; }
    public string DisplayName { get; }
    public string Category { get; }
    public string Description { get; }
    public string Content { get; }
    public string SourcePath { get; }

    public PromptTemplate(string id, string displayName, string category, string description, string content, string sourcePath)
    {
        Id = id ?? throw new ArgumentNullException(nameof(id));
        DisplayName = displayName ?? throw new ArgumentNullException(nameof(displayName));
        Category = category ?? throw new ArgumentNullException(nameof(category));
        Description = description ?? string.Empty;
        Content = content ?? throw new ArgumentNullException(nameof(content));
        SourcePath = sourcePath ?? throw new ArgumentNullException(nameof(sourcePath));
    }
}
