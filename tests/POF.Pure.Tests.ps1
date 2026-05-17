<#
.SYNOPSIS
    Characterization tests for POF.ps1 pure functions.
.DESCRIPTION
    Pins the observable behavior of POF.ps1's pure helper functions so the
    pipeline can be refactored against a green test suite. Tests load POF.ps1
    via dot-source with $env:POF_LOAD_ONLY set so the main orchestration loop
    does not run.

    Functions covered:
      - Resolve-EffectiveJobType
      - Resolve-EffectiveAppType (post-fix desired behavior; see CLAUDE.md)
      - Get-AgentSchemaTemplate
      - Get-AgentSystemPrompt
      - New-RequirementsRequestPacket
      - New-PofRequirementsCheckpointRecord
      - Get-FirstJsonObjectText
      - Test-ContainsMarkdownFence / Test-ContainsMarkdownFenceInObject
      - Normalize-AgentContractObject
      - ConvertTo-NormalizedAgentJson
      - Get-SwarmRequestsFromText
      - New-MaintenanceFallbackOutput
      - Get-ObservedGoalEvidence
#>

BeforeAll {
    $scriptPath = $PSCommandPath
    if (-not $scriptPath) { $scriptPath = $MyInvocation.MyCommand.Path }
    $testsDir = Split-Path -Parent $scriptPath
    $repoRoot = Split-Path -Parent $testsDir
    $script:PofScript = Join-Path $repoRoot 'Orchestration\scripts\POF.ps1'

    # Test-mode env vars: skip orchestration loop, pretend API key is set.
    $env:POF_LOAD_ONLY = '1'
    if (-not $env:OPENAI_API_KEY) { $env:OPENAI_API_KEY = 'test-key' }

    # Dot-source POF.ps1 — pure function defs become available in this scope.
    # OutputRoot points at TestDrive so the script's directory creation is sandboxed.
    . $script:PofScript -RunId 'pof-pure-test' -OutputRoot $TestDrive -Goal 'characterization-tests'
}

AfterAll {
    Remove-Item Env:POF_LOAD_ONLY -ErrorAction SilentlyContinue
}

Describe 'Resolve-EffectiveJobType' {
    It 'returns lowercased trimmed value for explicit input' {
        Resolve-EffectiveJobType -GoalText '' -RequestedJobType '  BUILD_NEW_APP  ' | Should -Be 'build_new_app'
    }
    It 'defaults to build_new_app when input is empty' {
        Resolve-EffectiveJobType -GoalText 'anything' -RequestedJobType '' | Should -Be 'build_new_app'
    }
    It 'aliases create_new_app -> build_new_app' {
        Resolve-EffectiveJobType -GoalText '' -RequestedJobType 'create_new_app' | Should -Be 'build_new_app'
    }
    It 'aliases new_app -> build_new_app' {
        Resolve-EffectiveJobType -GoalText '' -RequestedJobType 'new_app' | Should -Be 'build_new_app'
    }
    It 'aliases maintenance -> maintain_existing_app' {
        Resolve-EffectiveJobType -GoalText '' -RequestedJobType 'maintenance' | Should -Be 'maintain_existing_app'
    }
    It 'passes through maintain_existing_app unchanged' {
        Resolve-EffectiveJobType -GoalText '' -RequestedJobType 'maintain_existing_app' | Should -Be 'maintain_existing_app'
    }
}

Describe 'Resolve-EffectiveAppType (desired post-fix behavior, see CLAUDE.md)' {
    Context 'Explicit caller value passthrough' {
        It 'returns lowercased trimmed value when RequestedAppType is provided' {
            Resolve-EffectiveAppType -GoalText 'irrelevant' -RequestedAppType '  WPF  ' | Should -Be 'wpf'
        }
        It 'explicit value wins over goal text inference' {
            Resolve-EffectiveAppType -GoalText 'build a react website' -RequestedAppType 'wpf' | Should -Be 'wpf'
        }
    }

    Context 'Spec inference — positive signal' {
        It 'detects wpf from desktop-app keyword' {
            Resolve-EffectiveAppType -GoalText 'Build a windows desktop app' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects wpf from winforms keyword' {
            Resolve-EffectiveAppType -GoalText 'Use winforms for the UI' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects wpf from xaml keyword' {
            Resolve-EffectiveAppType -GoalText 'XAML-based controls' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects wpf from tkinter keyword (Python GUI)' {
            Resolve-EffectiveAppType -GoalText 'Build a Tkinter desktop app' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects wpf from pyqt keyword' {
            Resolve-EffectiveAppType -GoalText 'Use PyQt for the interface' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects wpf from wxpython keyword' {
            Resolve-EffectiveAppType -GoalText 'Render with wxPython' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'detects web from react keyword' {
            Resolve-EffectiveAppType -GoalText 'Build a React app' -RequestedAppType '' | Should -Be 'web'
        }
        It 'detects web from website keyword' {
            Resolve-EffectiveAppType -GoalText 'Publish a website' -RequestedAppType '' | Should -Be 'web'
        }
        It 'detects web from next.js keyword' {
            Resolve-EffectiveAppType -GoalText 'Build with Next.js' -RequestedAppType '' | Should -Be 'web'
        }
    }

    Context 'Spec inference — negation context must not produce false positive' {
        It 'does not classify as web when goal says "do not create a web app"' {
            Resolve-EffectiveAppType -GoalText 'Build a Tkinter desktop app. Do not create a web app.' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'does not classify as web when non-goals exclude React' {
            $goal = 'Build a Tkinter app. Non-goals: Do not use React. Do not use HTML.'
            Resolve-EffectiveAppType -GoalText $goal -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'does not classify as web when "avoid" precedes web keywords' {
            Resolve-EffectiveAppType -GoalText 'Build a PyQt app. Avoid browser-based UIs.' -RequestedAppType '' | Should -Be 'wpf'
        }
        It 'returns unknown (not web) when only negation context mentions web keywords' {
            $goal = 'Generic data-processing CLI script. Do not use React or HTML.'
            Resolve-EffectiveAppType -GoalText $goal -RequestedAppType '' | Should -Be 'unknown'
        }
    }

    Context 'Fallback' {
        It 'returns "unknown" (NOT "web") for empty/ambiguous goal' {
            Resolve-EffectiveAppType -GoalText '' -RequestedAppType '' | Should -Be 'unknown'
        }
        It 'returns "unknown" for goal with no app-type signal' {
            Resolve-EffectiveAppType -GoalText 'Analyze CSV data and produce summary statistics' -RequestedAppType '' | Should -Be 'unknown'
        }
    }
}

Describe 'Get-AgentSchemaTemplate' {
    It 'returns a non-empty JSON template string for ConceptualModelContract' {
        $tpl = Get-AgentSchemaTemplate -AgentName 'ConceptualModelContract'
        $tpl | Should -Not -BeNullOrEmpty
        $tpl | Should -Match '"interpretation"'
        $tpl | Should -Match '"acceptance_tests"'
    }
    It 'returns $null for unknown agent name' {
        Get-AgentSchemaTemplate -AgentName 'NotARealAgent' | Should -BeNullOrEmpty
    }
}

Describe 'Get-PofPhasePlan' {
    BeforeAll {
        $script:PlanAgents = @(
            [PSCustomObject]@{ name = 'ConceptualModelContract'; prompt = 'cmc' },
            [PSCustomObject]@{ name = 'Researcher'; prompt = 'r' },
            [PSCustomObject]@{ name = 'Engineer'; prompt = 'e' },
            [PSCustomObject]@{ name = 'Critic'; prompt = 'c' },
            [PSCustomObject]@{ name = 'Synthesizer'; prompt = 's' },
            [PSCustomObject]@{ name = 'ValidationAuditor'; prompt = 'v' },
            [PSCustomObject]@{ name = 'Commissioner'; prompt = 'comm' },
            [PSCustomObject]@{ name = 'Supervisor'; prompt = 'sup' },
            [PSCustomObject]@{ name = 'Historian'; prompt = 'h' },
            [PSCustomObject]@{ name = 'RepoContextBuilder'; prompt = 'rc' },
            [PSCustomObject]@{ name = 'ReviewGate'; prompt = 'rg' },
            [PSCustomObject]@{ name = 'PRPublisher'; prompt = 'pp' },
            [PSCustomObject]@{ name = 'CustomAgent'; prompt = 'x' }
        )
    }

    It 'returns 9 phases in canonical order' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        @($plan).Count | Should -Be 9
        @($plan | ForEach-Object Name) | Should -Be @(
            'Pre/RepoContext', 'Pre/MaintenanceFallback', 'Contract',
            'Contributors', 'Synthesis', 'Validation', 'Evaluation',
            'Supervision', 'History'
        )
    }

    It 'every phase declares Name, Handler, ExecutionMode, Agents, MaintenanceOnly, CanBlock, ClarificationGate' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        foreach ($phase in $plan) {
            $names = @($phase.PSObject.Properties.Name)
            $names | Should -Contain 'Name'
            $names | Should -Contain 'Handler'
            $names | Should -Contain 'ExecutionMode'
            $names | Should -Contain 'Agents'
            $names | Should -Contain 'MaintenanceOnly'
            $names | Should -Contain 'CanBlock'
            $names | Should -Contain 'ClarificationGate'
        }
    }

    It 'only Contract phase has CanBlock = $true' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $blocking = @($plan | Where-Object { $_.CanBlock })
        $blocking.Count | Should -Be 1
        $blocking[0].Name | Should -Be 'Contract'
    }

    It 'Contract clarification gate is Advisory for build_new_app' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $contract = $plan | Where-Object { $_.Name -eq 'Contract' }
        $contract.ClarificationGate.Behavior | Should -Be 'Advisory'
    }

    It 'Contract clarification gate is Halt for maintain_existing_app' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'maintain_existing_app'
        $contract = $plan | Where-Object { $_.Name -eq 'Contract' }
        $contract.ClarificationGate.Behavior | Should -Be 'Halt'
    }

    It 'Pre/RepoContext and Pre/MaintenanceFallback are MaintenanceOnly = $true' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        ($plan | Where-Object { $_.Name -eq 'Pre/RepoContext' }).MaintenanceOnly | Should -BeTrue
        ($plan | Where-Object { $_.Name -eq 'Pre/MaintenanceFallback' }).MaintenanceOnly | Should -BeTrue
    }

    It 'all non-pre phases are MaintenanceOnly = $false' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $nonPre = $plan | Where-Object { $_.Name -notlike 'Pre/*' }
        foreach ($p in $nonPre) {
            $p.MaintenanceOnly | Should -BeFalse
        }
    }

    It 'Contributors phase contains all non-reserved agents' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $contributors = $plan | Where-Object { $_.Name -eq 'Contributors' }
        $names = @($contributors.Agents | ForEach-Object name)
        $names | Should -Contain 'Researcher'
        $names | Should -Contain 'Engineer'
        $names | Should -Contain 'Critic'
        $names | Should -Contain 'CustomAgent'
        $names | Should -Not -Contain 'ConceptualModelContract'
        $names | Should -Not -Contain 'Commissioner'
        $names | Should -Not -Contain 'Synthesizer'
        $names | Should -Not -Contain 'ValidationAuditor'
        $names | Should -Not -Contain 'Supervisor'
        $names | Should -Not -Contain 'Historian'
        $names | Should -Not -Contain 'RepoContextBuilder'
        $names | Should -Not -Contain 'ReviewGate'
        $names | Should -Not -Contain 'PRPublisher'
    }

    It 'Contributors phase is the only Parallel phase' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $parallel = @($plan | Where-Object { $_.ExecutionMode -eq 'Parallel' })
        $parallel.Count | Should -Be 1
        $parallel[0].Name | Should -Be 'Contributors'
    }

    It 'each reserved agent appears in its named phase' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        ($plan | Where-Object { $_.Name -eq 'Contract' }).Agents[0].name           | Should -Be 'ConceptualModelContract'
        ($plan | Where-Object { $_.Name -eq 'Synthesis' }).Agents[0].name          | Should -Be 'Synthesizer'
        ($plan | Where-Object { $_.Name -eq 'Validation' }).Agents[0].name         | Should -Be 'ValidationAuditor'
        ($plan | Where-Object { $_.Name -eq 'Evaluation' }).Agents[0].name         | Should -Be 'Commissioner'
        ($plan | Where-Object { $_.Name -eq 'Supervision' }).Agents[0].name        | Should -Be 'Supervisor'
        ($plan | Where-Object { $_.Name -eq 'History' }).Agents[0].name            | Should -Be 'Historian'
        ($plan | Where-Object { $_.Name -eq 'Pre/RepoContext' }).Agents[0].name    | Should -Be 'RepoContextBuilder'
    }

    It 'Pre/MaintenanceFallback contains both ReviewGate and PRPublisher' {
        $plan = Get-PofPhasePlan -Agents $script:PlanAgents -EffectiveJobType 'build_new_app'
        $names = @(($plan | Where-Object { $_.Name -eq 'Pre/MaintenanceFallback' }).Agents | ForEach-Object name)
        $names | Should -Contain 'ReviewGate'
        $names | Should -Contain 'PRPublisher'
    }

    It 'returns empty Agents lists for phases whose canonical agent is missing' {
        $partialRoster = @([PSCustomObject]@{ name = 'Researcher'; prompt = 'r' })
        $plan = Get-PofPhasePlan -Agents $partialRoster -EffectiveJobType 'build_new_app'
        ($plan | Where-Object { $_.Name -eq 'Commissioner' -or $_.Name -eq 'Evaluation' } | Select-Object -First 1).Agents.Count | Should -Be 0
    }
}

Describe 'Composable prompt builder primitives' {
    It 'New-PromptBuilder returns hashtable with empty segments list' {
        $b = New-PromptBuilder
        $b.ContainsKey('segments') | Should -BeTrue
        @($b.segments).Count | Should -Be 0
    }
    It 'Add-PromptSegment appends trimmed text' {
        $b = New-PromptBuilder
        Add-PromptSegment -Builder $b -Text '  hello  ' | Out-Null
        $b.segments[0] | Should -Be 'hello'
    }
    It 'Add-PromptSegment ignores empty/whitespace text' {
        $b = New-PromptBuilder
        Add-PromptSegment -Builder $b -Text '' | Out-Null
        Add-PromptSegment -Builder $b -Text '   ' | Out-Null
        Add-PromptSegment -Builder $b -Text $null | Out-Null
        @($b.segments).Count | Should -Be 0
    }
    It 'Build-PromptString joins segments with double newline' {
        $b = New-PromptBuilder
        Add-PromptSegment -Builder $b -Text 'A' | Out-Null
        Add-PromptSegment -Builder $b -Text 'B' | Out-Null
        Build-PromptString -Builder $b | Should -Be "A`n`nB"
    }
    It 'Add-EngineerArtifactRulesSegment is a no-op for non-Engineer agents' {
        $b = New-PromptBuilder
        $agent = [PSCustomObject]@{ name = 'Researcher' }
        Add-EngineerArtifactRulesSegment -Builder $b -Agent $agent | Out-Null
        @($b.segments).Count | Should -Be 0
    }
    It 'Add-EngineerArtifactRulesSegment emits the richer (parallel-canonical) text for Engineer' {
        # The consolidated Engineer rules text is the one historically used in
        # the parallel-execution path. Pin its distinguishing markers so future
        # edits don't silently change Engineer's actual prompt.
        $b = New-PromptBuilder
        $agent = [PSCustomObject]@{ name = 'Engineer' }
        Add-EngineerArtifactRulesSegment -Builder $b -Agent $agent | Out-Null
        $text = Build-PromptString -Builder $b
        $text | Should -Match 'complete runnable project'
        $text | Should -Match 'docs/markdown'
        $text | Should -Match 'package\.json, index\.html'
    }
    It 'Add-CmcGuidanceSegment is a no-op for non-CMC agents' {
        $b = New-PromptBuilder
        $agent = [PSCustomObject]@{ name = 'Engineer' }
        Add-CmcGuidanceSegment -Builder $b -Agent $agent -EffectiveAppType 'wpf' -EffectiveJobType 'build_new_app' | Out-Null
        @($b.segments).Count | Should -Be 0
    }
    It 'Add-MaintenanceOutOfScopeSegment is a no-op for non-maintenance agents' {
        $b = New-PromptBuilder
        $agent = [PSCustomObject]@{ name = 'Engineer' }
        Add-MaintenanceOutOfScopeSegment -Builder $b -Agent $agent -EffectiveJobType 'build_new_app' | Out-Null
        @($b.segments).Count | Should -Be 0
    }
    It 'Add-MaintenanceOutOfScopeSegment is a no-op on maintenance jobs' {
        $b = New-PromptBuilder
        $agent = [PSCustomObject]@{ name = 'ReviewGate' }
        Add-MaintenanceOutOfScopeSegment -Builder $b -Agent $agent -EffectiveJobType 'maintain_existing_app' | Out-Null
        @($b.segments).Count | Should -Be 0
    }
}

Describe 'Get-AgentSystemPrompt' {
    BeforeAll {
        $script:Agent_CMC = [PSCustomObject]@{ name = 'ConceptualModelContract'; prompt = 'CMC_BASE_PROMPT' }
        $script:Agent_Engineer = [PSCustomObject]@{ name = 'Engineer'; prompt = 'ENG_BASE_PROMPT' }
        $script:Agent_Critic = [PSCustomObject]@{ name = 'Critic'; prompt = 'CRITIC_BASE_PROMPT' }
        $script:Agent_Researcher = [PSCustomObject]@{ name = 'Researcher'; prompt = 'RES_BASE_PROMPT' }
        $script:Agent_ReviewGate = [PSCustomObject]@{ name = 'ReviewGate'; prompt = 'RG_BASE_PROMPT' }
    }

    It 'includes BaseInstruction at the top when provided' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Researcher -BaseInstruction 'OVERRIDE_INSTRUCTION' -EffectiveAppType 'unknown' -EffectiveJobType 'build_new_app'
        $out | Should -Match '^OVERRIDE_INSTRUCTION'
    }
    It 'includes agent.prompt' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Researcher -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'RES_BASE_PROMPT'
    }
    It 'adds raw-JSON-only guidance for ConceptualModelContract' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'raw JSON only'
    }
    It 'adds raw-JSON-only guidance for Engineer' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Engineer -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'raw JSON only'
    }
    It 'adds raw-JSON-only guidance for Critic' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Critic -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'raw JSON only'
    }
    It 'does not add raw-JSON-only guidance for Researcher' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Researcher -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Not -Match 'raw JSON only'
    }
    It 'adds Engineer artifacts rules for Engineer' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_Engineer -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'artifacts\[\]'
        $out | Should -Match 'Honor the tech stack'
    }
    It 'adds build_new_app guidance to CMC when job_type is build_new_app' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'create-new-app goals'
    }
    It 'omits build_new_app guidance for CMC when job_type is maintain_existing_app' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'maintain_existing_app'
        $out | Should -Not -Match 'create-new-app goals'
    }
    It 'adds WPF-probe guidance to CMC when app_type is wpf' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'wpf' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'WPF desktop'
        $out | Should -Match 'WPF-observable probes'
    }
    It 'adds web-probe guidance to CMC when app_type is web' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'web' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'DOM/SVG/canvas probes'
    }
    It 'omits both web and wpf CMC guidance when app_type is unknown' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_CMC -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'build_new_app'
        $out | Should -Not -Match 'WPF-observable probes'
        $out | Should -Not -Match 'DOM/SVG/canvas probes'
    }
    It 'adds maintenance-out-of-scope guidance for ReviewGate on build_new_app' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_ReviewGate -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'build_new_app'
        $out | Should -Match 'Maintenance-only gating is out of scope'
    }
    It 'omits maintenance-out-of-scope guidance for ReviewGate on maintain_existing_app' {
        $out = Get-AgentSystemPrompt -Agent $script:Agent_ReviewGate -BaseInstruction '' -EffectiveAppType 'unknown' -EffectiveJobType 'maintain_existing_app'
        $out | Should -Not -Match 'Maintenance-only gating is out of scope'
    }
}

Describe 'New-RequirementsRequestPacket' {
    It 'produces summary, blockers, and proposed_acceptance_tests keys' {
        $packet = New-RequirementsRequestPacket -Question 'Need clarification on input format' -AgentName 'ConceptualModelContract'
        $packet.Keys | Should -Contain 'summary'
        $packet.Keys | Should -Contain 'blockers'
        $packet.Keys | Should -Contain 'proposed_acceptance_tests'
    }
    It 'wraps the question in a single blocker' {
        $packet = New-RequirementsRequestPacket -Question 'CLEAR_QUESTION' -AgentName 'ConceptualModelContract'
        $packet.blockers.Count | Should -Be 1
        $packet.blockers[0].question | Should -Be 'CLEAR_QUESTION'
        $packet.blockers[0].id | Should -Be 'req_1'
    }
    It 'attaches schema_hint when agent has a template' {
        $packet = New-RequirementsRequestPacket -Question 'Q' -AgentName 'ConceptualModelContract'
        $packet.blockers[0].schema_hint | Should -Not -BeNullOrEmpty
    }
    It 'falls back to default question when input is blank' {
        $packet = New-RequirementsRequestPacket -Question '   ' -AgentName 'ConceptualModelContract'
        $packet.blockers[0].question | Should -Match 'Provide the missing product requirements'
    }
    It 'embeds the agent name in the summary' {
        $packet = New-RequirementsRequestPacket -Question 'Q' -AgentName 'Engineer'
        $packet.summary | Should -Match 'Engineer requires'
    }
}

Describe 'New-PofRequirementsCheckpointRecord' {
    It 'returns kind=requirements with checkpoint_id and run_id' {
        $req = New-RequirementsRequestPacket -Question 'Q' -AgentName 'ConceptualModelContract'
        $rec = New-PofRequirementsCheckpointRecord -AgentName 'ConceptualModelContract' -Question 'Q' -RequirementsRequest $req
        $rec.kind | Should -Be 'requirements'
        $rec.checkpoint_id | Should -Match '^requirements-'
        $rec.run_id | Should -Be 'pof-pure-test'
        $rec.status | Should -Be 'awaiting_user'
        $rec.default_option | Should -Be 'Provide explicit requirements answers'
        $rec.options.Count | Should -Be 2
    }
}

Describe 'Get-FirstJsonObjectText' {
    It 'extracts the first balanced JSON object' {
        Get-FirstJsonObjectText -Text 'preamble {"a":1} trailing' | Should -Be '{"a":1}'
    }
    It 'handles nested objects' {
        Get-FirstJsonObjectText -Text '{"a":{"b":2},"c":3}' | Should -Be '{"a":{"b":2},"c":3}'
    }
    It 'handles strings containing braces' {
        Get-FirstJsonObjectText -Text '{"a":"}{ inside string"}' | Should -Be '{"a":"}{ inside string"}'
    }
    It 'handles escaped quotes within strings' {
        Get-FirstJsonObjectText -Text '{"a":"escaped \" quote"}' | Should -Be '{"a":"escaped \" quote"}'
    }
    It 'returns $null when no opening brace exists' {
        Get-FirstJsonObjectText -Text 'no json here' | Should -BeNullOrEmpty
    }
    It 'returns $null for null input' {
        Get-FirstJsonObjectText -Text $null | Should -BeNullOrEmpty
    }
    It 'returns $null for whitespace-only input' {
        Get-FirstJsonObjectText -Text '   ' | Should -BeNullOrEmpty
    }
}

Describe 'Test-ContainsMarkdownFence' {
    It 'returns true when fence present' {
        Test-ContainsMarkdownFence -Text "before ``````json after" | Should -BeTrue
    }
    It 'returns false for plain text' {
        Test-ContainsMarkdownFence -Text 'plain text' | Should -BeFalse
    }
    It 'returns false for null/empty' {
        Test-ContainsMarkdownFence -Text $null | Should -BeFalse
        Test-ContainsMarkdownFence -Text '' | Should -BeFalse
    }
}

Describe 'Test-ContainsMarkdownFenceInObject' {
    It 'detects fence in string field' {
        $obj = [PSCustomObject]@{ description = "fenced ``````python content" }
        Test-ContainsMarkdownFenceInObject -Value $obj | Should -BeTrue
    }
    It 'detects fence nested in array' {
        $obj = [PSCustomObject]@{ items = @('clean', "dirty ``````bash") }
        Test-ContainsMarkdownFenceInObject -Value $obj | Should -BeTrue
    }
    It 'returns false for clean object' {
        $obj = [PSCustomObject]@{ a = 'clean'; b = 42; c = $null; d = @('x', 'y') }
        Test-ContainsMarkdownFenceInObject -Value $obj | Should -BeFalse
    }
    It 'returns false for $null' {
        Test-ContainsMarkdownFenceInObject -Value $null | Should -BeFalse
    }
}

Describe 'Normalize-AgentContractObject' {
    It 'returns object unchanged for non-Critic agents' {
        $obj = [PSCustomObject]@{ issues = @([PSCustomObject]@{ file = $null; line = 'x' }) }
        $result = Normalize-AgentContractObject -AgentName 'Engineer' -Object $obj
        $result.issues[0].file | Should -BeNullOrEmpty
    }
    It 'replaces null/empty Critic issue.file with "unknown"' {
        $obj = [PSCustomObject]@{ issues = @([PSCustomObject]@{ file = '' }) }
        $result = Normalize-AgentContractObject -AgentName 'Critic' -Object $obj
        $result.issues[0].file | Should -Be 'unknown'
    }
    It 'removes non-numeric Critic issue.line' {
        $obj = [PSCustomObject]@{ issues = @([PSCustomObject]@{ line = 'NOT_A_NUMBER' }) }
        $result = Normalize-AgentContractObject -AgentName 'Critic' -Object $obj
        $result.issues[0].PSObject.Properties.Name | Should -Not -Contain 'line'
    }
    It 'rounds numeric Critic issue.line to integer' {
        $obj = [PSCustomObject]@{ issues = @([PSCustomObject]@{ line = '42.6' }) }
        $result = Normalize-AgentContractObject -AgentName 'Critic' -Object $obj
        $result.issues[0].line | Should -Be 43
    }
    It 'removes Critic issue.line when value is < 1' {
        $obj = [PSCustomObject]@{ issues = @([PSCustomObject]@{ line = '0' }) }
        $result = Normalize-AgentContractObject -AgentName 'Critic' -Object $obj
        $result.issues[0].PSObject.Properties.Name | Should -Not -Contain 'line'
    }
    It 'returns $null unchanged' {
        Normalize-AgentContractObject -AgentName 'Critic' -Object $null | Should -BeNullOrEmpty
    }
}

Describe 'ConvertTo-NormalizedAgentJson' {
    It 'rejects output containing markdown code fences' {
        $result = ConvertTo-NormalizedAgentJson -RawOutput "``````json`n{}`n``````" -AgentName 'Engineer'
        $result.ok | Should -BeFalse
        $result.error | Should -Match 'markdown'
    }
    It 'rejects empty/whitespace strings' {
        $result = ConvertTo-NormalizedAgentJson -RawOutput '' -AgentName 'Engineer'
        $result.ok | Should -BeFalse
    }
    It 'rejects $null via mandatory parameter binding' {
        # The function declares [Parameter(Mandatory = $true)]$RawOutput without
        # [AllowNull()], so PowerShell rejects $null at parameter binding
        # rather than inside the function body. Pin that contract.
        { ConvertTo-NormalizedAgentJson -RawOutput $null -AgentName 'Engineer' } |
            Should -Throw -ExceptionType ([System.Management.Automation.ParameterBindingException])
    }
    It 'parses valid JSON' {
        $result = ConvertTo-NormalizedAgentJson -RawOutput '{"a":1}' -AgentName 'Engineer'
        $result.ok | Should -BeTrue
        $result.parsed.a | Should -Be 1
    }
    It 'rejects invalid JSON with parse-error message' {
        $result = ConvertTo-NormalizedAgentJson -RawOutput '{invalid' -AgentName 'Engineer'
        $result.ok | Should -BeFalse
        $result.error | Should -Match 'not valid strict JSON'
    }
    It 'unwraps OpenAI-style {choices:[{message:{content:...}}]} response objects' {
        $wrap = [PSCustomObject]@{
            choices = @([PSCustomObject]@{
                message = [PSCustomObject]@{ content = '{"a":1}' }
            })
        }
        $result = ConvertTo-NormalizedAgentJson -RawOutput $wrap -AgentName 'Engineer'
        $result.ok | Should -BeTrue
        $result.parsed.a | Should -Be 1
    }
}

Describe 'Get-SwarmRequestsFromText' {
    # The function uses `return ,$requests` which preserves the array shape
    # across the return boundary. Callers receive an outer 1-element wrapper
    # around the requests array; the actual list lives at $reqs[0]. The tests
    # below pin both the wrapper and the inner contents.

    It 'extracts one SWARM_REQUEST block with parsed goal' {
        $text = 'preamble [SWARM_REQUEST]{"goal":"x"}[/SWARM_REQUEST] tail'
        $reqs = Get-SwarmRequestsFromText -Text $text
        $inner = @($reqs)
        $inner.Count | Should -BeGreaterOrEqual 1
        $inner[0].goal | Should -Be 'x'
    }
    It 'extracts multiple SWARM_REQUEST blocks (both goals parsed)' {
        $text = '[SWARM_REQUEST]{"goal":"a"}[/SWARM_REQUEST] mid [SWARM_REQUEST]{"goal":"b"}[/SWARM_REQUEST]'
        $reqs = Get-SwarmRequestsFromText -Text $text
        # Flatten through the comma-wrap to enumerate actual requests.
        $flat = @()
        foreach ($r in $reqs) { foreach ($item in @($r)) { $flat += $item } }
        $goals = @($flat | ForEach-Object { $_.goal })
        $goals | Should -Contain 'a'
        $goals | Should -Contain 'b'
    }
    It 'ignores malformed JSON inside SWARM_REQUEST (no goals parsed)' {
        $text = '[SWARM_REQUEST]{not json}[/SWARM_REQUEST]'
        $reqs = Get-SwarmRequestsFromText -Text $text
        $flat = @()
        foreach ($r in $reqs) { foreach ($item in @($r)) { $flat += $item } }
        $flat.Count | Should -Be 0
    }
    It 'returns nothing parseable when no SWARM_REQUEST present' {
        $reqs = Get-SwarmRequestsFromText -Text 'no swarm requests here'
        $flat = @()
        foreach ($r in $reqs) { foreach ($item in @($r)) { $flat += $item } }
        $flat.Count | Should -Be 0
    }
}

Describe 'New-MaintenanceFallbackOutput' {
    It 'returns RepoContextBuilder fallback with status=insufficient_input' {
        $out = New-MaintenanceFallbackOutput -AgentName 'RepoContextBuilder' -Reason 'no repo'
        $parsed = $out | ConvertFrom-Json
        $parsed.status | Should -Be 'insufficient_input'
        $parsed.errors | Should -Contain 'no repo'
        $parsed.schema_version | Should -Be '1.0'
    }
    It 'returns ReviewGate fallback with status=error' {
        $out = New-MaintenanceFallbackOutput -AgentName 'ReviewGate' -Reason 'no contract'
        $parsed = $out | ConvertFrom-Json
        $parsed.status | Should -Be 'error'
        $parsed.errors | Should -Contain 'no contract'
    }
    It 'returns PRPublisher fallback with status=failed and draft=true' {
        $out = New-MaintenanceFallbackOutput -AgentName 'PRPublisher' -Reason 'no contract'
        $parsed = $out | ConvertFrom-Json
        $parsed.status | Should -Be 'failed'
        $parsed.draft | Should -BeTrue
    }
    It 'returns generic error fallback for unknown agents' {
        $out = New-MaintenanceFallbackOutput -AgentName 'SomethingElse' -Reason 'oops'
        $parsed = $out | ConvertFrom-Json
        $parsed.status | Should -Be 'error'
        $parsed.errors | Should -Contain 'oops'
    }
}

Describe 'Get-ObservedGoalEvidence' {
    It 'returns full goal when shorter than preview max' {
        $ev = Get-ObservedGoalEvidence -GoalText 'short goal' -PreviewMax 300
        $ev.observedGoalLength | Should -Be 10
        $ev.observedGoalPreview | Should -Be 'short goal'
    }
    It 'truncates goal preview to PreviewMax' {
        $long = 'A' * 500
        $ev = Get-ObservedGoalEvidence -GoalText $long -PreviewMax 100
        $ev.observedGoalLength | Should -Be 500
        $ev.observedGoalPreview.Length | Should -Be 100
    }
    It 'handles null goal' {
        $ev = Get-ObservedGoalEvidence -GoalText $null
        $ev.observedGoalLength | Should -Be 0
    }
}
