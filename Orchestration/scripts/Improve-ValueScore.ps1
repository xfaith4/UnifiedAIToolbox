function Improve-ValueScore {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)] [string]$previousDesign,
        [Parameter(Mandatory)] [string[]]$commissionerFeedback,
        [int]$TargetScore = 7
    )

    $currentScore = Calculate-ValueScore -design $previousDesign

    $improvementAreas = Analyze-Feedback -feedback $commissionerFeedback

    $modifiedDesign = $previousDesign
    foreach ($area in $improvementAreas) {
        $modifiedDesign = Modify-Design -design $modifiedDesign -area $area
    }

    $newScore = Calculate-ValueScore -design $modifiedDesign

    [pscustomobject]@{
        PreviousDesign = $previousDesign
        CurrentScore   = $currentScore
        Improvements   = $improvementAreas
        NewDesign      = $modifiedDesign
        NewScore       = $newScore
        Result         = if ($newScore -ge $TargetScore) { "Improvement successful" } else { "Improvement needs work" }
    }
}

function Calculate-ValueScore {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)] [string]$design
    )

    $keywords = @{
        # Positive drivers
        "clarity"          = 2
        "usability"        = 2
        "accessibility"    = 2
        "performance"      = 2
        "maintainable"     = 1
        "scalable"         = 1
        "secure"           = 2
        "privacy"          = 2
        "testable"         = 1
        "documentation"    = 1
        "automation"       = 1
        "cost-effective"   = 1
        "reliable"         = 2
        "availability"     = 1
        "observability"    = 1

        # Negative drivers (penalties)
        "complex"          = -2
        "overengineered"   = -2
        "ambiguous"        = -2
        "slow"             = -2
        "fragile"          = -2
        "manual"           = -1
        "insecure"         = -3
        "opaque"           = -1
    }

    $text = $design.ToLowerInvariant()
    $score = 0
    foreach ($k in $keywords.Keys) {
        if ($text -match [regex]::Escape($k)) {
            # Weight by presence count (cap to avoid runaway)
            $count = ([regex]::Matches($text, [regex]::Escape($k))).Count
            $score += [math]::Min($count, 3) * $keywords[$k]
        }
    }

    # Normalize to a 0–10 band
    $score = [math]::Max([math]::Min([math]::Round(($score + 10) / 2), 10), 0)
    return $score
}

function Analyze-Feedback {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)] [string[]]$feedback
    )

    $map = @{
        "unclear"          = "clarity"
        "confusing"        = "clarity"
        "hard to use"      = "usability"
        "usability"        = "usability"
        "a11y"             = "accessibility"
        "accessibility"    = "accessibility"
        "slow"             = "performance"
        "performance"      = "performance"
        "security"         = "security"
        "privacy"          = "privacy"
        "docs"             = "documentation"
        "documentation"    = "documentation"
        "tests"            = "testability"
        "test"             = "testability"
        "complex"          = "simplify"
        "overengineered"   = "simplify"
        "cost"             = "cost"
        "too expensive"    = "cost"
        "scale"            = "scalability"
        "availability"     = "availability"
        "observability"    = "observability"
    }

    $areas = New-Object System.Collections.Generic.HashSet[string]
    foreach ($line in $feedback) {
        $l = $line.ToLowerInvariant()
        foreach ($k in $map.Keys) {
            if ($l -match [regex]::Escape($k)) {
                [void]$areas.Add($map[$k])
            }
        }
    }

    if ($areas.Count -eq 0) {
        # Fallback if feedback is vague
        return @("clarity","usability")
    }

    return $areas.ToArray()
}

function Modify-Design {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory)] [string]$design,
        [Parameter(Mandatory)] [string]$area
    )

    switch ($area) {
        "clarity" {
            return ($design + "`n- Clarify objectives, success metrics, and constraints." +
                              "`n- Add a concise summary and glossary of terms.")
        }
        "usability" {
            return ($design + "`n- Introduce user flows and primary tasks; reduce steps for key actions.")
        }
        "accessibility" {
            return ($design + "`n- Enforce WCAG 2.1 AA; keyboard parity; color contrast; aria labels.")
        }
        "performance" {
            return ($design + "`n- Add performance budgets, lazy-loading, caching strategy, and profiling plan.")
        }
        "security" {
            return ($design + "`n- Threat model summary; input validation; secrets handling; least privilege.")
        }
        "privacy" {
            return ($design + "`n- Data minimization; retention policy; DSR processes; PII redaction.")
        }
        "documentation" {
            return ($design + "`n- Add README quickstart, ADRs, and troubleshooting section.")
        }
        "testability" {
            return ($design + "`n- Define unit/e2e test strategy, coverage targets, and CI gates.")
        }
        "simplify" {
            return ($design + "`n- Remove non-essential components; prefer configuration over customization.")
        }
        "cost" {
            return ($design + "`n- Compare hosting tiers; add autoscaling caps; leverage static assets/CDN.")
        }
        "scalability" {
            return ($design + "`n- Horizontal scaling path, stateless services, backpressure and queues.")
        }
        "availability" {
            return ($design + "`n- Add SLOs/SLIs, redundancy, graceful degradation and circuit breakers.")
        }
        "observability" {
            return ($design + "`n- Centralized logs, metrics, traces; dashboards and alert runbooks.")
        }
        default {
            return ($design + "`n- General improvements applied for: $area")
        }
    }
}

# Example usage:
$result = Improve-ValueScore -previousDesign "Initial design focuses on performance but is complex." -commissionerFeedback @(
  "The design is unclear and hard to use",
  "Performance is good but documentation is lacking",
  "Consider accessibility"
)
$result | Format-List