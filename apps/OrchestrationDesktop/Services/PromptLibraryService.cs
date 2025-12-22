using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using OrchestrationDesktop.Models;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace OrchestrationDesktop.Services;

public sealed class PromptLibraryService
{
    private readonly string? _catalogRoot;
    private readonly IDeserializer _deserializer;

    public PromptLibraryService(string repoRoot)
    {
        _catalogRoot = ResolveCatalogRoot(repoRoot);
        _deserializer = new DeserializerBuilder()
            .WithNamingConvention(LowerCaseNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();
    }

    public IReadOnlyList<PromptTemplate> LoadTemplates()
    {
        if (string.IsNullOrWhiteSpace(_catalogRoot) || !Directory.Exists(_catalogRoot))
        {
            return Array.Empty<PromptTemplate>();
        }

        var files = Directory.EnumerateFiles(_catalogRoot, "*.prompt.yaml", SearchOption.AllDirectories);
        var templates = new List<PromptTemplate>();

        foreach (var file in files)
        {
            try
            {
                var yaml = File.ReadAllText(file);
                var document = _deserializer.Deserialize<PromptDocument>(yaml);
                if (document is null || string.IsNullOrWhiteSpace(document.Id))
                {
                    continue;
                }

                var content = BuildContent(document);
                if (string.IsNullOrWhiteSpace(content))
                {
                    continue;
                }

                var displayName = CreateDisplayName(document.Id);
                var category = ExtractCategory(document.Id);
                var description = CreateDescription(document);

                templates.Add(new PromptTemplate(
                    document.Id,
                    displayName,
                    category,
                    description,
                    content.Trim(),
                    file));
            }
            catch
            {
                // Ignore malformed entries and continue.
            }
        }

        return templates
            .OrderBy(t => t.Category, StringComparer.OrdinalIgnoreCase)
            .ThenBy(t => t.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string? ResolveCatalogRoot(string repoRoot)
    {
        var fromEnv = Environment.GetEnvironmentVariable("AI_PROMPT_LIBRARY_CATALOG");
        if (!string.IsNullOrWhiteSpace(fromEnv) && Directory.Exists(fromEnv))
        {
            return fromEnv;
        }

        var local = Path.Combine(repoRoot, "data", "prompts");
        return Directory.Exists(local) ? local : null;
    }

    private static string BuildContent(PromptDocument document)
    {
        var blocks = document.Blocks ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        var sections = new[]
        {
            (label: "System", value: blocks.TryGetValue("system", out var system) ? system : null),
            (label: "Instructions", value: blocks.TryGetValue("instructions", out var instructions) ? instructions : null),
            (label: "Constraints", value: blocks.TryGetValue("constraints", out var constraints) ? constraints : null),
            (label: "Style", value: blocks.TryGetValue("style", out var style) ? style : null),
            (label: "Examples", value: blocks.TryGetValue("examples", out var examples) ? examples : null)
        };

        var builder = new StringBuilder();
        foreach (var (label, value) in sections)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                continue;
            }

            if (builder.Length > 0)
            {
                builder.AppendLine().AppendLine();
            }

            builder.AppendLine($"{label}:");
            builder.AppendLine(value.Trim());
        }

        return builder.ToString();
    }

    private static string CreateDisplayName(string id)
    {
        var segments = id.Split('.', StringSplitOptions.RemoveEmptyEntries);
        var formatted = segments
            .Select(segment =>
            {
                var words = segment.Split(new[] { '_', '-' }, StringSplitOptions.RemoveEmptyEntries);
                return string.Join(" ", words.Select(ToTitleCase));
            });
        return string.Join(" • ", formatted);
    }

    private static string ExtractCategory(string id)
    {
        var first = id.Split('.', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return string.IsNullOrWhiteSpace(first) ? "General" : ToTitleCase(first);
    }

    private static string CreateDescription(PromptDocument document)
    {
        var blocks = document.Blocks ?? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        if (blocks.TryGetValue("instructions", out var instructions) &&
            !string.IsNullOrWhiteSpace(instructions))
        {
            var normalized = instructions.Replace("\r", string.Empty).Trim();
            var firstLine = normalized.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(firstLine))
            {
                return firstLine.Length > 220 ? firstLine[..220] + "…" : firstLine;
            }
        }

        return "Structured prompt template.";
    }

    private static string ToTitleCase(string value)
    {
        return CultureInfo.CurrentCulture.TextInfo.ToTitleCase(value.ToLowerInvariant());
    }

    private sealed class PromptDocument
    {
        public string Id { get; set; } = string.Empty;
        public Dictionary<string, string> Blocks { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
