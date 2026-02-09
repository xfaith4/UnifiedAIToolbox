Math/visual algorithms specification for “Phi Explorer”
(Compute φ, continued fraction approximation, Fibonacci ratios, golden rectangle tiling, spiral point generation)

1) φ (golden ratio) computation

1.1 Direct closed form (recommended)
Definition:
  φ = (1 + √5) / 2

Algorithm (JS Number):
  phi = (1 + Math.sqrt(5)) / 2

Notes:
- This is accurate to double precision (~15–16 decimal digits).
- Use this as the reference value for error calculations throughout.

1.2 Fixed-point iteration (optional demo)
Using φ = 1 + 1/φ.
Start x0 = 1.0 (or 2.0), iterate:
  x_{k+1} = 1 + 1/x_k

Stop when |x_{k+1} − x_k| < ε.

Notes:
- Converges to φ for positive starting values.
- Useful to show the self-referential property but slower than closed form.

2) Continued fraction approximation (convergents)

Target continued fraction for φ:
  φ = [1; 1, 1, 1, 1, …]
Depth k means:
  C_k = [1; 1 repeated k times]
Common convention examples:
- k=0: [1] = 1
- k=1: [1;1] = 2
- k=2: [1;1,1] = 3/2
(You can also define k as “number of 1s after the leading 1”; be consistent in UI.)

2.1 General convergent recurrence (works for any CF)
Given partial quotients a0, a1, …, ak.

Initialize:
  p_{-2}=0, p_{-1}=1
  q_{-2}=1, q_{-1}=0

For i = 0..k:
  p_i = a_i*p_{i-1} + p_{i-2}
  q_i = a_i*q_{i-1} + q_{i-2}

Convergent:
  C_i = p_i / q_i

For φ’s CF: a0=1 and for i≥1, a_i=1.
So recurrence simplifies but the same code can be used.

2.2 Implementation options

Option A: Number (fast, limited exactness)
- Use JS Number for p and q.
- Safe exact integers only up to 2^53−1; Fibonacci-like growth means overflow of integer exactness around i≈78.
- Still fine for decimal approximation earlier; errors will eventually be dominated by rounding.

Option B: BigInt (exact rational, recommended for deeper k)
- Use BigInt for p and q:
  p_i = a_i*p_{i-1} + p_{i-2} where a_i is BigInt (1n or 1n etc.)
- Exact fraction output p/q for large k.

Decimal rendering from BigInt rational:
To display p/q as decimal with D digits after decimal:
- integerPart = p / q
- remainder = p % q
- For j in 1..D:
    remainder *= 10
    digit = remainder / q
    remainder = remainder % q
Collect digits.
This is long division; avoids converting huge BigInt to Number.

Error vs φ:
- If you need high-precision error with BigInt, either:
  (a) compute decimal string and compare to φ numeric approximately, or
  (b) compute a rational error bound without converting: compare p/q to φ ~ Number at moderate k.
Practical choice:
- For k up to ~30–40, just compute C = Number(p)/Number(q) even if p,q are BigInt by converting to Number (only if p,q within safe magnitude); otherwise show fraction and omit high-precision error, or show error using decimal-string subtraction with fixed D.

2.3 Relationship to Fibonacci numbers (useful note for UI)
For φ’s continued fraction, convergents are ratios of consecutive Fibonacci numbers:
  C_k = F_{k+2} / F_{k+1}   (depending on indexing convention)
So you can cross-check correctness by comparing p,q to Fibonacci.

3) Fibonacci sequence and ratios converging to φ

3.1 Fibonacci generation
Indexing:
- F0 = 0, F1 = 1, Fn = F_{n-1} + F_{n-2} for n≥2
Often ratios use F_{n+1}/F_n for n≥1.

Number version:
  F[0]=0; F[1]=1
  for n=2..N: F[n]=F[n-1]+F[n-2]

BigInt version:
  F[0]=0n; F[1]=1n
  for n=2..N: F[n]=F[n-1]+F[n-2]

3.2 Ratio and error
For n ≥ 1:
  R_n = F_{n+1} / F_n
Error metrics:
  absErr_n = |R_n − φ|
  relErr_n = absErr_n / φ

Number computation:
  R_n = F[n+1] / F[n] as Number.

BigInt computation:
- Exact rational R_n = F[n+1] / F[n] (BigInt fraction).
- For plotting, convert to Number only up to a cap; beyond that, compute decimal string with limited digits, or plot error using a float approximation with scaling caveats.

Practical thresholds:
- With Number Fibonacci, Fn exceeds 2^53 around n≈78 (F78≈8.94e15, F79≈1.45e16). Past that, integer exactness is lost.
- With BigInt, values are exact but converting to Number loses precision; keep BigInt for table fraction display.

3.3 Efficient incremental ratios (optional)
Instead of storing all F:
Maintain (a,b) = (F_n, F_{n+1}). Each step:
  (a,b) <- (b, a+b)
Then ratio at step n is b/a (for n≥1).

4) Golden rectangle tiling (recursive square removal)

Goal: Given a rectangle, repeatedly remove the largest possible square to produce a sequence of similar rectangles when ratio is φ.

4.1 Coordinate conventions
Work in 2D with an axis-aligned rectangle:
- Top-left corner (x0,y0)
- Width W, Height H
Assume W ≥ H for a “landscape” golden rectangle; if not, you can rotate logic or treat the larger side as “width” along the current orientation.

4.2 Single subdivision step
Given rectangle (x,y,W,H) with W ≥ H:
- Square S1 has side s = H.
- Place it flush on the left (or right) edge:
  Square rect: (x, y, s, s)
- Remaining rectangle R1:
  (x + s, y, W − s, H)

If H > W (portrait):
- Square side s = W.
- Place it at top:
  Square rect: (x, y, s, s)
- Remaining rect:
  (x, y + s, W, H − s)

4.3 Recursive tiling algorithm
Inputs:
- Initial rectangle (x,y,W,H)
- maxDepth
- minSizePx (stop when square side < minSizePx)
- optionally: stop if remaining rectangle is too thin.

Pseudo:
tiles = []
function subdivide(x,y,W,H,depth):
  if depth==0: return
  if W<=0 or H<=0: return
  if max(W,H) < minSizePx: return

  if W>=H:
     s=H
     tiles.push({x,y,w:s,h:s, orientation:'landscape'})
     subdivide(x+s, y, W-s, H, depth-1)
  else:
     s=W
     tiles.push({x,y,w:s,h:s, orientation:'portrait'})
     subdivide(x, y+s, W, H-s, depth-1)

Output:
- tiles: list of squares (for drawing)
- optionally store the remaining rectangles too for outlines.

4.4 Self-similarity check (optional highlight)
Given initial ratio r = W/H (assuming W≥H):
- If |r − φ| < tolerance (e.g., 0.01), emphasize that the remainder rectangle ratio is close to r again:
  remainder ratio r' = H/(W−H) (for W>H)
For a perfect golden rectangle, r' = r = φ.

Compute:
  if W>H:
    rPrime = H/(W-H)
    similarityErr = |rPrime - r|
Use to drive a “near-golden” badge.

5) Fibonacci square tiling (for the Fibonacci spiral approximation)

Goal: Build a chain of adjacent squares whose side lengths follow Fibonacci numbers (scaled), then draw quarter-circle arcs inside each.

5.1 Square sizes
Choose N squares (N≥2). Let sizes:
  s0 = F_k * scale
  s1 = F_{k+1} * scale
  ...
or simply start from 1,1,2,3,5,...:
  sizes[i] = Fib(i+1) * scale with Fib(1)=1,Fib(2)=1

For stable visuals, you often start with [1,1,2,3,5,8,...].

5.2 Layout algorithm (grid-walk)
Maintain a bounding box and place each new square adjacent to the previous shape, rotating direction 90° each time.

Represent current composite bounding box:
- minX, minY, maxX, maxY
And maintain a direction d in {0,1,2,3} representing where the next square attaches relative to current bounding box:
Example convention (clockwise):
  d=0: attach to the right
  d=1: attach to the top
  d=2: attach to the left
  d=3: attach to the bottom

Initialize with first square at (0,0) with side sizes[0].
Set bbox accordingly. Place second square adjacent (commonly to the right of first), set d progression.

For i from 1..N-1:
  s = sizes[i]
  if d==0 (right):
    x = maxX; y = minY
    place square (x, y, s)
    maxX = maxX + s
    // bbox height might need expansion if s > (maxY-minY):
    // Aligning rules matter; common approach aligns to one edge (minY or maxY-s)
  if d==1 (top):
    x = maxX - s; y = minY - s
    place square
    minY -= s
  if d==2 (left):
    x = minX - s; y = minY
    place square
    minX -= s
  if d==3 (bottom):
    x = minX; y = maxY
    place square
    maxY += s
  d = (d+1) mod 4

Alignment detail:
- The above “corner alignment” approach is commonly used to get the classic Fibonacci tiling, but you must be consistent about which corner you anchor on each step.
- An alternative robust method: track the last square plus direction and compute placement relative to the current bounding box to keep the spiral consistent. Test visually with N=6–10.

Output:
- squares[] with {x,y,s, index}

5.3 Quarter-circle arc per square (Fibonacci spiral)
For each square, draw an arc of radius s that connects two corners, oriented to continue the spiral.

Arc definition (canvas):
- center (cx, cy)
- radius r = s
- startAngle, endAngle (in radians)
The center and angles depend on direction d at that step.

If you record, for each placed square, the direction used when it was attached, you can map to arc parameters. Example mapping (one common convention):
- When square is attached on the right (d==0), arc center at square’s bottom-left corner.
- When attached on top (d==1), center at bottom-left or bottom-right depending on your tiling orientation.
Because conventions vary, the reliable approach is:
- Determine which corner of the square is the spiral’s “turning” corner (the corner shared with the previous bounding box corner).
- Use that corner as the arc center.
- The arc spans 90° across the square interior.

Concrete approach:
For each square, choose the arc center as one of its four corners:
  corners: (x,y), (x+s,y), (x+s,y+s), (x,y+s)
Pick center so that the arc stays inside the square and connects the two corners that lie on the spiral path.
Then angles are one of:
  0→π/2, π/2→π, π→3π/2, 3π/2→2π
depending on orientation.

This is easiest to validate by rendering and adjusting until the arc sequence is continuous.

6) Golden (logarithmic) spiral point generation (reference spiral)

Goal: Generate points on the logarithmic spiral associated with φ, scaled and positioned to match a golden rectangle.

6.1 Spiral in polar form
A logarithmic spiral:
  r(θ) = a * e^(bθ)

Golden spiral property:
- Radius multiplies by φ every quarter turn (Δθ = π/2).
So:
  r(θ + π/2) = φ * r(θ)
=> a*e^(b(θ+π/2)) = φ * a*e^(bθ)
=> e^(bπ/2) = φ
=> b = (2 ln φ) / π

Thus:
  b = 2*ln(φ)/π
  r(θ) = a * exp(b*θ)

6.2 Convert to Cartesian points
Given center (cx,cy):
  x(θ) = cx + r(θ) * cos(θ)
  y(θ) = cy + r(θ) * sin(θ)

Sampling:
- Choose θ0..θ1, step Δθ.
- For smoothness: Δθ ~ 0.05 to 0.15 radians depending on scale.
- Or sample by arc length adaptively (optional): reduce step where curvature changes.

6.3 Fitting spiral to a golden rectangle tiling corner
To visually align with the square-removal spiral:
- Choose the spiral’s center at the inner corner where squares meet (the “eye” corner).
- Choose a so that at some reference angle θ_ref the radius equals the side length of the first square (or a fraction of it).

Practical fitting method:
Inputs:
- The first (largest) square side s0 and its arc should be approximated by the spiral around θ in some range of length π/2.
Pick θ_ref such that the spiral passes near the square boundary:
- Set θ_ref = 0
- Set a = s0 (or s0 * k where k ~ 0.95..1.05 tuned visually)

Then adjust:
- If spiral is too large/small, scale a.
- If spiral is rotated, add a rotation offset:
  Use θ' = θ + rot
  x = cx + r(θ) cos(θ')
  y = cy + r(θ) sin(θ')

6.4 Output for rendering
Return a polyline:
points = [{x,y}, ...] for θ in [θ0, θ1]
Typical θ range:
- Start near the center: θ0 = -2π (small radius)
- End outward: θ1 = 2π to 5π depending on how many turns you want

7) Error computations and readouts (shared utilities)

Given a measured ratio r:
absErr = Math.abs(r - phi)
relErr = absErr / phi

For comparing convergents or Fibonacci ratios:
- Display both abs and rel.
- For very small errors, show in scientific notation:
  absErr.toExponential(3) or adaptive formatting.

8) Rendering/interaction notes (implementation-lean, algorithm-relevant)

8.1 Throttled redraw
When sliders/dragging update parameters rapidly:
- Store latest state.
- Schedule draw with requestAnimationFrame if not already scheduled.

8.2 Canvas coordinate scaling
For crispness on high-DPI:
- Multiply canvas width/height by devicePixelRatio.
- Scale drawing context accordingly.
Algorithms above produce logical coordinates; apply a global scale and translate to fit viewport.

8.3 Robust handling of rectangle orientation
If user sets H > W:
- Either rotate logic (swap roles) for tiling,
- or accept portrait mode and apply the portrait subdivision rule (section 4.2).
Ensure readouts use ratio r = max(W,H)/min(W,H) if you want a ratio always ≥ 1, but clearly label what is being measured (W/H vs long/short).

These specifications are sufficient to implement:
- φ numeric reference
- Continued fraction convergents (fraction + decimal + error)
- Fibonacci ratio convergence (table/plot + error)
- Golden rectangle square tiling
- Fibonacci quarter-arc spiral approximation
- Golden logarithmic spiral polyline generation