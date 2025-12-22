namespace OrchestrationDesktop.Models;

public sealed record PromptBatchRefinementOptions(
    string PromptRoot,
    int Iterations,
    bool SaveArtifacts,
    string Mode,
    string OutRoot,
    string[] IncludePatterns,
    string ExcludeRegex);
