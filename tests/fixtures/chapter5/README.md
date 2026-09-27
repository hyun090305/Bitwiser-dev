# Chapter 5 verified search fixtures

Source: [Issue #495](https://github.com/hyun090305/Bitwiser-dev/issues/495), comments [1/3](https://github.com/hyun090305/Bitwiser-dev/issues/495#issuecomment-5854186997), [2/3](https://github.com/hyun090305/Bitwiser-dev/issues/495#issuecomment-5854187131), [3/3](https://github.com/hyun090305/Bitwiser-dev/issues/495#issuecomment-5854187290).

The nine JSON blocks are preserved as supplied, including their original descriptive titles and source commit. These are analysis wrappers (`stageId`, `circuit`, verified cost, proposed thresholds), not player save files. They are never included in the demo or Electron product package, nor shown as answers in the game.

`node --test tests/star-progression.test.mjs` validates both language definitions, terminals, grid, planar wires, grading and costs 219/230/172/370/349/296/478/220/524. Every circuit earns 3 stars under the authored targets. These are best-found placements, not proofs of global optimality. The game's FSM/truth table remains the grader's independent source of truth.
