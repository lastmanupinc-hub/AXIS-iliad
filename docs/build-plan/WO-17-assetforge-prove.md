# WO-17 · assetforge-prove

**Claim it makes true:** assetforge (public): "Generate production assets from text prompts" (mesh/anim/texture).

**Tier:** B_client_external_gated · **Effort:** L · **Package:** lastmanupinc-hub/assetforge (separate Python repo; NOT the axis-iliad TS monorepo this cwd points at)

**Verify verdict:** implementable_by_sonnet5=`False` · fully_closes_claim=`False` · confidence=`medium`
**Missing for codeability:** "A concrete design for the TRELLIS image->GLB path as a multi-call stateful pipeline (not a single probe_predict), including the exact endpoint sequence and session-state passing; the real Gradio Space ID for text->image (the given IDs are model repos, not Spaces); a defined backend/telemetry semantics for the bridged path (which backend is recorded); the actual MotionDiffusion result format so the np.load parser is correct; and a way to obtain the committed TRELLIS fixture that doesn't depend on the same gated live path (or an honest relabel that the fixture is a generic non-cube mesh, since the test only checks vertex_count>200 and never verifies provenance)."
**Spec overclaims flagged:** Models TRELLIS image->3D as a single _generate_hf_space_image_bytes helper / one probe_predict call, ignoring that the real TRELLIS Space is a stateful multi-endpoint pipeline; Assumes gradio_client.Client works against 'stabilityai/stable-diffusion-xl' and 'black-forest-labs/FLUX.2-dev', which are model repos not Gradio Spaces; Calls the fixture 'genuine TRELLIS output' while the offline test only asserts vertex_count>200 and never enforces provenance -- a fabricated mesh passes; The no-placeholder acceptance says an 'AST scan finds no reference from any generate*/_generate_hf_space* function', implying transitive call-graph reachability but realistically reducing to a textual/direct-reference scan; Live-mesh acceptance asserts telemetry[-1].backend=='hf_space' without defining which backend a text->image->TRELLIS bridge path records; Frames the target as 'genuinely end-to-end text->mesh' while the truth of that path depends on uncontrollable live Spaces and multi-step orchestration the spec does not specify; CI is claimed as proof of the core claim, but the live suite is continue-on-error and non-gating, so nothing ever enforces 'produces REAL model output'
**Hidden external gates:** HF ZeroGPU quota: Microsoft/TRELLIS runs on ZeroGPU which is heavily rate-limited for anonymous/free accounts and may effectively require an HF Pro subscription for usable quota -- HF_TOKEN alone may not be enough; A real hosted text-to-image Gradio Space: the spec's bridge targets 'stabilityai/stable-diffusion-xl' and 'black-forest-labs/FLUX.2-dev', which are MODEL repos not Spaces -- gradio_client.Client cannot connect to them; an actual SDXL/FLUX Space ID must be found; TRELLIS multi-step stateful session protocol (/preprocess_image -> /image_to_3d -> /extract_glb with session hash) -- an external API contract the single-call probe cannot satisfy; Bootstrap dependency: the 'real_trellis_sample.glb' fixture can only be obtained from one successful live TRELLIS run, which is the same externally-gated path being tested; GuyTevet/MotionDiffusion output format is unverified -- the anim path np.load()s the result but the Space may return a video/other format, not a .npy array; Continued existence/uptime of all three free Spaces at build time (they sleep, get removed, or change signatures)

## Current state
Repo lastmanupinc-hub/assetforge (SEPARATE repo, not the TS toolbox monorepo this cwd points at; single commit 2026-05-07, MIT, Python 3.11, hatchling). Public README claims "Generate production assets from text prompts ... mesh, animation, texture." Reality, verified against source:

- HF-Space call signatures are GUESSED, not validated. `src/assetforge/ai_mesh_generator.py` `_generate_hf_space_text` calls `client.predict(prompt, seed, api_name="/generate_text")` (and `/generate_image` for images) under the literal comment "Note: Exact API depends on the Space's Gradio interface"; `HF_SPACE_ID="Microsoft/TRELLIS"` -- TRELLIS is fundamentally image-to-3D, so a `/generate_text` endpoint likely does NOT exist. `ai_animation_generator.py` `_generate_hf_space` guesses `client.predict(prompt, seed, duration, api_name="/generate")`, `HF_SPACE_ID="GuyTevet/MotionDiffusion"`. `ai_texture_generator.py` guesses `api_name="/generate"` for SDXL (`stabilityai/stable-diffusion-xl`) and `/infer`->`/generate` for FLUX2 (`black-forest-labs/FLUX.2-dev`).
- The `if __name__=='__main__'` demos produce fake output: `ai_mesh_generator.py:589 build_test_glb(...)` builds a hand-coded cube (used at lines 727-765); `ai_animation_generator.py:564 build_test_walk_motion(...)` is a literal sinusoidal walk (`0.3*math.sin(phase)`). Texture comment (~line 129): "currently emits cylinder-humanoid placeholders."
- No `tests/` dir and no `.github/workflows/` (both 404). `pyproject.toml` lists `pytest` in `[dev]` but nothing exercises it.
- `cli.py` wires only `mesh` and `anim` -- the texture generator is NOT exposed at all, contradicting the mesh/anim/texture claim.
- `_parse_hf_result` in the anim generator calls `np.load(...)`, but `numpy` is NOT in `dependencies` (only typer, gradio_client, pillow) -- the anim HF path cannot parse a result today.

Validated seam to copy: AXIS Avatar Foundry `engine/axis_foundry/generation/flux2_backend.py:640-658` `_invoke` -- correct multi-signature probe (`for api_name in ("/infer","/generate"): try predict except: continue; raise last`). Foundry `trellis2_backend.py` does NOT use a TRELLIS gradio Space (it hits a self-hosted GPU HTTP endpoint image->GLB with a native parametric fallback), so there is NO validated `Microsoft/TRELLIS` gradio signature to copy -- assetforge must resolve it live via `gradio_client.Client(...).view_api()`.

TIER REASONING: probe module, view_api resolution, texture CLI wiring, placeholder removal, offline unit suite, CI, README fix are all pure-software buildable now; but the claim's core ("produces REAL model output") can only be PROVEN against live external HF Spaces, which code cannot guarantee -- hence Tier B with a flag-gated buildable path.

## Target state (== the claim is literally true)
The runnable text-prompt path produces REAL remote model output for all three modalities, proven by tests, with the cube / sinusoidal walk / placeholder removed from every reachable path:

1. Endpoint signatures are RESOLVED against the live Space via `client.view_api()` plus an ordered fallback probe (mirroring Foundry `_invoke`), never a single hard-coded `api_name`. If a Space exposes no text endpoint (expected for Microsoft/TRELLIS image-to-3D), the text->mesh claim is satisfied by an in-repo text->image (SDXL/FLUX) -> TRELLIS-image bridge so "text prompt -> mesh" is genuinely end-to-end.
2. The texture generator is wired into the CLI (`assetforge texture ...`) so mesh/anim/texture are all runnable.
3. `generate*()` NEVER returns a placeholder: on backend failure it raises; `build_test_glb`/`build_test_walk_motion` are removed from the runtime path (moved to test fixtures / renamed self-test-only, unreachable from generate()).
4. A real pytest suite exists: offline unit tests (parser round-trip on a committed real TRELLIS GLB fixture, probe/fallback logic, CLI surface, no-placeholder-reachable guard) that always run, plus network-gated live integration tests that hit each Space and assert output is real model output (not the deterministic placeholder).
5. CI runs the unit suite as a required gate and the live suite as a scheduled/dispatch canary (needs `HF_TOKEN` secret, `continue-on-error` because free Spaces are flaky).
6. README corrected to say assets come from open-source models on Hugging Face Spaces (best-effort availability) or self-hosted GPU -- dropping any implication of a guaranteed production SLA from free Spaces.

## Files to create / edit
- src/assetforge/_gradio_probe.py (new)
- src/assetforge/ai_mesh_generator.py (edit: probe + text->image->TRELLIS bridge; drop hard-coded api_name; remove cube from runtime path)
- src/assetforge/ai_animation_generator.py (edit: probe; remove sinusoid from runtime path)
- src/assetforge/ai_texture_generator.py (edit: probe; remove placeholder from runtime path)
- src/assetforge/cli.py (edit: add `texture` command)
- pyproject.toml (edit: add numpy runtime dep; add pytest markers config)
- tests/__init__.py (new)
- tests/conftest.py (new: integration marker + ASSETFORGE_RUN_LIVE/HF_TOKEN skip logic)
- tests/fixtures/real_trellis_sample.glb (new: committed genuine TRELLIS output, >200 verts)
- tests/fixtures/placeholder_cube.glb (new: output of former build_test_glb, for != assertions)
- tests/unit/test_parse_glb.py (new)
- tests/unit/test_probe.py (new)
- tests/unit/test_cli.py (new)
- tests/unit/test_no_placeholder_reachable.py (new)
- tests/live/test_mesh_live.py (new)
- tests/live/test_anim_live.py (new)
- tests/live/test_texture_live.py (new)
- .github/workflows/ci.yml (new)
- README.md (edit: honest availability wording)

## Interfaces
```ts
```python
# src/assetforge/_gradio_probe.py  (mirrors Foundry flux2_backend.py:640-658)
from typing import Any, Sequence

class EndpointResolutionError(RuntimeError): ...

def list_named_endpoints(client: Any) -> list[str]:
    """Named api_names the live Space exposes, via client.view_api(return_format='dict')['named_endpoints']."""

def resolve_api_name(client: Any, preferred: Sequence[str]) -> str | None:
    """First `preferred` name the Space actually exposes; None if none match (caller may fall back to probe)."""

def probe_predict(client: Any, *args: Any, api_names: Sequence[str], **kwargs: Any) -> Any:
    """Try client.predict(*args, api_name=name) for each name in order; re-raise last exception if all fail."""

# ai_mesh_generator.py -- replace _generate_hf_space_text body:
#   client = Client(self.HF_SPACE_ID, hf_token=self._hf_token)
#   names = [n for n in ("/generate_text","/text_to_3d") if resolve_api_name(client,[n])]
#   if not names:  # TRELLIS has no text endpoint -> bridge
#       png = StableDiffusionTextureGenerator(...).generate(prompt, seed)   # text->image
#       return self._generate_hf_space_image_bytes(png, seed)              # image->GLB
#   result = probe_predict(client, prompt, seed, api_names=names)
#   return self._read_result_glb(result)
def _generate_hf_space_image_bytes(self, png_bytes: bytes, seed: int) -> bytes: ...  # new helper on TrellisMeshGenerator

# cli.py -- new command
@cli.command("texture")
def texture(prompt: str, seed: int = 1, output: Path = Path("albedo.png")) -> None: ...

# tests/conftest.py
import os, pytest
def pytest_collection_modifyitems(config, items):
    run_live = os.environ.get("ASSETFORGE_RUN_LIVE") == "1" and bool(os.environ.get("HF_TOKEN"))
    skip = pytest.mark.skip(reason="live HF Space test; set ASSETFORGE_RUN_LIVE=1 and HF_TOKEN")
    for it in items:
        if "live" in it.keywords and not run_live: it.add_marker(skip)
```
```

## Acceptance tests (DONE == claim true)
- OFFLINE (always, CI gate): `pip install -e .[dev] && pytest tests/unit -q` exits 0 with >=8 passing tests and 0 network calls.
- tests/unit/test_parse_glb.py: TrellisMeshGenerator.parse_glb(open('tests/fixtures/real_trellis_sample.glb','rb').read()) returns vertex_count > 200 and triangle_count > 100 (proves parser handles real, non-cube output).
- tests/unit/test_cli.py: CliRunner().invoke(cli, ['--help']).output contains all of 'mesh', 'anim', 'texture' (proves texture is wired).
- tests/unit/test_probe.py: with a stub client whose predict() raises for api_name='/a' and returns 'ok' for '/b', probe_predict(stub, api_names=('/a','/b'))=='ok'; and resolve_api_name(stub with view_api exposing only '/b', ('/a','/b'))=='/b'.
- tests/unit/test_no_placeholder_reachable.py: monkeypatch gradio_client.Client to raise ConnectionError -> TrellisMeshGenerator(HF_SPACE).generate_from_text('x') raises RuntimeError (NOT a returned cube); AND an AST scan of src/assetforge (excluding tests) finds no reference to build_test_glb/build_test_walk_motion from any generate*/_generate_hf_space* function.
- LIVE (gated: ASSETFORGE_RUN_LIVE=1 + HF_TOKEN): `pytest tests/live -q`. test_mesh_live: generate_from_text('a bronze greek helmet', seed=42) yields GLB with vertex_count>200 and mesh_hash != blake2b(open('tests/fixtures/placeholder_cube.glb','rb').read()), and telemetry[-1].backend=='hf_space'.
- test_anim_live: generate('a warrior raises a shield', seed=7, duration=4.0).content_hash != AnimationClip built from build_test_walk_motion(same frames/fps).content_hash, AND the root-joint trajectory is not a single sinusoid (numpy FFT: count of bins with magnitude > 10% of peak is > 1).
- test_texture_live: generate('weathered oak planks', seed=42) returns PNG that Pillow opens at the requested resolution with pixel std-dev > 5.0 (not flat/placeholder) and bytes != the former cylinder-humanoid placeholder.
- CI: .github/workflows/ci.yml has a `unit` job (every push, required) and a `live-canary` job (on: schedule + workflow_dispatch, env HF_TOKEN from secrets, continue-on-error: true) that runs tests/live and reports per-modality pass/fail.
- README no longer implies a guaranteed production SLA: it states assets are generated via open-source models on Hugging Face Spaces (best-effort availability) or self-hosted GPU.

## External gates (code alone can't satisfy)
- Live, reachable HF Spaces exposing the assumed modality: Microsoft/TRELLIS (image-to-3D; likely NO text endpoint -> forces the text->image->mesh bridge), GuyTevet/MotionDiffusion, and an SDXL/FLUX text-to-image Space. Free Spaces sleep, rate-limit, change api signatures, or get removed -- not controllable by code.
- An HF_TOKEN (free Hugging Face account) to avoid anonymous rate limits and to run the live/canary tests in CI. Free but an external account/secret, not code.

## New runtime deps (project forbids w/o discussion)
- numpy>=2.0 -- required at RUNTIME for the animation HF path (_parse_hf_result uses np.load) and for the anim not-a-sinusoid FFT assertion; currently imported lazily but absent from pyproject dependencies. Repo rule forbids adding deps without discussion -- FLAG for approval.

## Depends on
_none_

## Doc impact / residual honesty caveat
Makes README 'Generate production assets from text prompts (mesh/animation/texture)' true for the runnable path: signatures are resolved live (not guessed), texture is exposed, and the cube/sinusoid/placeholder are gone from every reachable path, with live tests asserting output is real remote model output != the placeholder. RESIDUAL HONESTY CAVEAT (must stay in README): reliability depends on free HF Spaces whose availability is best-effort -- durable/'production' throughput requires a self-hosted GPU HTTP endpoint (as Foundry's trellis2_backend uses) or paid HF Inference Endpoints; and text->mesh may route through a text->image->TRELLIS-image bridge because TRELLIS itself is image-to-3D. Do not let the doc imply a guaranteed uptime SLA from free Spaces.
