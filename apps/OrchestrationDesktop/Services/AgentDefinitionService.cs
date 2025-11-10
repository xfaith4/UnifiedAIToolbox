using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using OrchestrationDesktop.Models;

namespace OrchestrationDesktop.Services;

public sealed class AgentDefinitionService
{
    private readonly string _agentsDirectory;
    private readonly string _defaultAgentsFile;
    private readonly JsonSerializerOptions _options;

    public AgentDefinitionService(string repoRoot)
    {
        if (string.IsNullOrWhiteSpace(repoRoot))
        {
            throw new ArgumentException("Repository root is required.", nameof(repoRoot));
        }

        _agentsDirectory = Path.Combine(repoRoot, "data", "agents");
        _defaultAgentsFile = Path.Combine(_agentsDirectory, "Agents.json");
        _options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true
        };
    }

    public IReadOnlyList<AgentDefinition> Load()
    {
        try
        {
            var sourceFile = ResolveSourceFile();
            if (sourceFile is null)
            {
                return Array.Empty<AgentDefinition>();
            }

            var json = File.ReadAllText(sourceFile);
            var document = JsonSerializer.Deserialize<AgentDocument>(json, _options);
            if (document?.Agents is null)
            {
                return Array.Empty<AgentDefinition>();
            }

            return document.Agents
                .Select(a => new AgentDefinition
                {
                    Name = a.Name ?? string.Empty,
                    Role = string.IsNullOrWhiteSpace(a.Role) ? "system" : a.Role,
                    Prompt = a.Prompt ?? string.Empty
                })
                .ToList();
        }
        catch
        {
            return Array.Empty<AgentDefinition>();
        }
    }

    public void Save(IEnumerable<AgentDefinition> definitions)
    {
        var snapshot = new AgentDocument
        {
            Agents = definitions
                .Where(d => !string.IsNullOrWhiteSpace(d.Name))
                .Select(d => new AgentRecord
                {
                    Name = d.Name.Trim(),
                    Role = string.IsNullOrWhiteSpace(d.Role) ? "system" : d.Role.Trim(),
                    Prompt = d.Prompt ?? string.Empty
                })
                .ToList()
        };

        if (!Directory.Exists(_agentsDirectory))
        {
            Directory.CreateDirectory(_agentsDirectory);
        }

        var json = JsonSerializer.Serialize(snapshot, _options);
        File.WriteAllText(_defaultAgentsFile, json);
    }

    private string? ResolveSourceFile()
    {
        if (File.Exists(_defaultAgentsFile))
        {
            return _defaultAgentsFile;
        }

        if (!Directory.Exists(_agentsDirectory))
        {
            return null;
        }

        var candidate = Directory.EnumerateFiles(_agentsDirectory, "Agents*.json", SearchOption.TopDirectoryOnly)
            .OrderBy(f => f)
            .FirstOrDefault();

        return candidate;
    }

    private sealed class AgentDocument
    {
        [JsonPropertyName("Agents")]
        public List<AgentRecord>? Agents { get; set; }
    }

    private sealed class AgentRecord
    {
        public string? Name { get; set; }
        public string? Role { get; set; }
        public string? Prompt { get; set; }
    }
}
