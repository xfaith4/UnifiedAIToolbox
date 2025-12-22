namespace OrchestrationDesktop.Models;

public sealed record PromptBatchRefinementResult(
    string? File,
    string? Id,
    string? Title,
    string? Kind,
    string? Status,
    string? PromptIdUsed,
    string? ArtifactsPath,
    string? OutFile,
    string? Error,
    int? TokensUsed,
    decimal? EstimatedCost);
