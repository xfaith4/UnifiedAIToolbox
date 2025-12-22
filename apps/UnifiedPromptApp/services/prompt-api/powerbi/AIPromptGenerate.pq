### BEGIN FILE: powerbi/AIPromptGenerate.pq
// Power Query (M) function to call the Prompt Workbench API and expand JSON.
// Use:  AITable = AIPromptGenerate("http://localhost:8000", "agent_webrtc_disconnect_v1.0.0", "Genesys Cloud Monitoring Assistant", "Explain likely causes and mitigations for WebRTC disconnects", "Prod", {"Executives","NOC Engineers"}, [log_snippet="...", timestamp="2025-08-18T12:00:00Z"], {"executive_summary","technical_json","chart_recommendations"}, {"exec","engineer","viz"})
let
AIPromptGenerate = (ApiBase as text, TemplateId as text, Role as text, Task as text, Environment as text, Audience as list, InputData as record, DesiredOutput as list, optional Modes as list) as table =>
let
modesList = if (Modes = null) then {"exec","engineer","viz"} else Modes,
payload = [
      template_id = TemplateId,
      role = Role,
      task = Task,
      context = [ environment = Environment, audience = Audience, scale = "100k agents; 12 BPO partners; global" ],
      input_data = InputData,
      desired_output = DesiredOutput,
      modes = modesList
    ],
    jsonText = Json.FromValue(payload),
    source = Json.Document(
      Web.Contents(
        ApiBase & "/api/generate",
        [
          Headers = [#"Content-Type"="application/json"],
          Content = jsonText
        ]
      )
    ),
    output = source[output],
    // Flatten into a friendly table
    execSummary = if Record.HasFields(output, "executive_summary") then output[executive_summary] else null,
    tech = if Record.HasFields(output, "technical_json") then output[technical_json] else null,
    charts = if Record.HasFields(output, "chart_recommendations") then output[chart_recommendations] else null,
    // Build rows
    tbl = #table(
      {"executive_summary", "technical_probable_cause", "technical_recommended_action", "chart_recommendations_json", "cache_key", "audit_id"},
      {
        {
          if execSummary = null then null else Text.Combine(List.Transform(execSummary, each _ as text), " | "),
          if tech = null or (not Record.HasFields(tech, "probable_cause")) then null else tech[probable_cause],
          if tech = null or (not Record.HasFields(tech, "recommended_action")) then null else tech[recommended_action],
          if charts = null then null else Json.FromValue(charts),
          source[cache_key],
          Number.From(source[audit_id])
        }
      }
    )
in
tbl # pyright: ignore[reportUndefinedVariable]
in
 AIPromptGenerate
### END FILE
