# Quick example:
 Invoke-PromptWorkbench -TemplateId 'agent_webrtc_disconnect_v1.0.0' `
     -Role 'Genesys Cloud Monitoring Assistant' `
     -Task 'Explain likely causes and mitigations for WebRTC disconnects' `
     -InputData @{ log_snippet = 'ICE negotiation failed across 3 regions'; timestamp = (Get-Date).ToString('s') + 'Z' } `
     -UseClientCache -Verbose `
     -Model 'GPT-4.1' 