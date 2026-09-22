"""Cartoon Studio V7: classic cartoons + photoreal AI microdramas + evidence videos."""
import sys, os
from pathlib import Path
import streamlit as st

st.set_page_config(page_title="Cartoon Studio V8", page_icon="🎬", layout="wide", initial_sidebar_state="expanded")

REALITYBLEND_AVAILABLE = False; REALITYBLEND_ERROR = None
try:
    from realityblend_ui import render_realityblend; REALITYBLEND_AVAILABLE = True
except Exception as exc: REALITYBLEND_ERROR = exc

CLASSIC_AVAILABLE = False; CLASSIC_ERROR = None; CLASSIC_MODULE = None
try:
    import classic_cartoon_ui as CLASSIC_MODULE
    from classic_cartoon_ui import render_classic_cartoon, join_videos
    from classic_actions import patch_classic_module, ACTION_PRESETS
    patch_classic_module(CLASSIC_MODULE); CLASSIC_AVAILABLE = True
except Exception as exc: CLASSIC_ERROR = exc

EVIDENCE_BOARD_AVAILABLE = False; EVIDENCE_BOARD_ERROR = None
try:
    from evidence_board_ui import render_evidence_board_studio
    from video_evidence_ui import render_video_evidence_panel
    EVIDENCE_BOARD_AVAILABLE = True
except Exception as exc: EVIDENCE_BOARD_ERROR = exc

SONG_STORY_AVAILABLE = False; SONG_STORY_ERROR = None
try:
    from song_story_engine import render_song_story
    SONG_STORY_AVAILABLE = True
except Exception as exc: SONG_STORY_ERROR = exc

PHOTOREAL_AVAILABLE = False; PHOTOREAL_ERROR = None
try:
    from photoreal_ui import render_photoreal_microdrama
    PHOTOREAL_AVAILABLE = True
except Exception as exc: PHOTOREAL_ERROR = exc

MOTION_PRESETS = ["Automatic (dialogue gestures)", "Idle", "Talk", "Walk", "Run", "Jump", "Bounce", "Float", "Nod", "Wave", "Point", "Shake", "Spin", "Slide Left", "Slide Right", "Dance", "Celebrate", "Crouch", "Pulse"]

def apply_classic_motion_override(label):
    try:
        import sprite_renderer as SPRITE
        if not hasattr(SPRITE, "_v6_original_compose_character_frame"):
            SPRITE._v6_original_compose_character_frame = SPRITE.compose_character_frame
        original = SPRITE._v6_original_compose_character_frame
        if label == MOTION_PRESETS[0]: SPRITE.compose_character_frame = original; return
        fallback = {"Walk":"Talking Hands","Run":"Laughing","Jump":"Laughing","Bounce":"Laughing","Float":"Thinking","Nod":"Thinking","Wave":"Waving","Point":"Pointing","Shake":"Nervous","Spin":"Waving","Dance":"Laughing","Celebrate":"Waving","Crouch":"Thinking","Slide Left":"None","Slide Right":"None","Talk":"Talking Hands","Pulse":"None","Idle":"None"}
        forced = fallback.get(label, "None")
        def wrapped(character_name, global_frame, talking, seed, scale=1.0, gesture=None):
            return original(character_name, global_frame, talking, seed, scale, gesture=forced)
        SPRITE.compose_character_frame = wrapped
    except Exception:
        pass

st.markdown("<style>.block-container{padding-top:1.5rem;padding-bottom:3rem}</style>", unsafe_allow_html=True)
st.title("🎬 Cartoon Studio V8")
st.caption("Turn songs into stories: lyrics → AI Director → storyboard → character actions → cartoon video.")

with st.sidebar:
    st.header("🎛️ Studio")
    mode = st.radio("Creation mode", ["🎵 Song → Story", "🎥 Photoreal Microdrama", "🎭 Classic Cartoon", "🌍 RealityBlend", "🕵️ Evidence Board", "🎞️ Join Clips"], index=0)
    st.divider()
    if mode == "🎭 Classic Cartoon":
        st.subheader("🎞️ Quick Motion")
        quick = st.selectbox("Quick action", MOTION_PRESETS, key="classic_motion")
        apply_classic_motion_override(quick)
        st.caption("Use the per-character timeline below for sequenced actions.")
    st.caption("Mode status:")
    st.caption(f"{'✅' if SONG_STORY_AVAILABLE else '❌'} Song → Story")
    st.caption(f"{'✅' if PHOTOREAL_AVAILABLE else '❌'} Photoreal Microdrama")
    st.caption(f"{'✅' if CLASSIC_AVAILABLE else '❌'} Classic Cartoon")
    st.caption(f"{'✅' if REALITYBLEND_AVAILABLE else '❌'} RealityBlend")
    st.caption(f"{'✅' if EVIDENCE_BOARD_AVAILABLE else '❌'} Discovery Story")

if mode == "🎵 Song → Story":
    if SONG_STORY_AVAILABLE:
        render_song_story()
    else:
        st.error("Song → Story could not be loaded."); st.code(str(SONG_STORY_ERROR))
elif mode == "🎥 Photoreal Microdrama":
    if PHOTOREAL_AVAILABLE:
        render_photoreal_microdrama()
    else:
        st.error("Photoreal Microdrama could not be loaded.")
        st.code(str(PHOTOREAL_ERROR))
elif mode == "🎭 Classic Cartoon":
    if CLASSIC_AVAILABLE:
        st.subheader("🎬 Character Action Timeline")
        st.info("One cue per line. Example: 0-2: Walk In → 2-4: Talk → 4-5: Point → 5-7: Walk")
        names = list(getattr(CLASSIC_MODULE, "CHARACTERS", {}).keys()); cols = st.columns(min(3, max(1, len(names))))
        for i, name in enumerate(names):
            with cols[i % len(cols)]:
                current = st.session_state.get(f"v6_action_{name}", "Idle")
                selected = st.selectbox(f"{name} default", ACTION_PRESETS, index=ACTION_PRESETS.index(current) if current in ACTION_PRESETS else 0, key=f"v6_action_select_{name}")
                st.session_state[f"v6_action_{name}"] = selected
                timeline = st.text_area("Timeline", value=st.session_state.get(f"v6_timeline_{name}", ""), height=105, key=f"v6_timeline_input_{name}", placeholder="0-2: Walk In\n2-4: Talk\n4-5: Point\n5-7: Walk")
                st.session_state[f"v6_timeline_{name}"] = timeline
        render_classic_cartoon()
    else:
        st.error("Classic Cartoon mode could not be loaded."); st.code(str(CLASSIC_ERROR))
elif mode == "🌍 RealityBlend":
    if REALITYBLEND_AVAILABLE: render_realityblend()
    else: st.error("RealityBlend could not be loaded."); st.code(str(REALITYBLEND_ERROR))
elif mode == "🕵️ Evidence Board":
    if EVIDENCE_BOARD_AVAILABLE:
        render_video_evidence_panel(); st.divider(); render_evidence_board_studio()
    else: st.error("Discovery Story could not be loaded."); st.code(str(EVIDENCE_BOARD_ERROR))
elif mode == "🎞️ Join Clips":
    st.header("🎞️ Join Clips")
    uploads = st.file_uploader("Upload MP4 clips in order", type=["mp4", "mov", "m4v"], accept_multiple_files=True)
    if uploads and CLASSIC_AVAILABLE and st.button("🔗 Join Clips", type="primary"):
        with st.spinner("Joining clips..."): result_path, err = join_videos(uploads)
        if err: st.error(f"Join failed: {err}")
        elif result_path and Path(result_path).exists():
            data = Path(result_path).read_bytes(); st.video(data); st.download_button("⬇️ Download Joined MP4", data=data, file_name="joined_episode.mp4", mime="video/mp4")

st.divider()
with st.expander("🔧 V8 Diagnostics"):
    st.write("Python:", sys.version.split()[0])
    st.write("Modes", {"Song → Story": SONG_STORY_AVAILABLE, "Photoreal Microdrama": PHOTOREAL_AVAILABLE, "Classic Cartoon": CLASSIC_AVAILABLE, "RealityBlend": REALITYBLEND_AVAILABLE, "Discovery Story": EVIDENCE_BOARD_AVAILABLE})
    st.write("Motion engine:", Path("motion_presets.py").exists())
    st.write("Timeline engine:", Path("timeline_actions.py").exists())
    st.write("Classic action engine:", Path("classic_actions.py").exists())
    st.write("Photoreal engine:", Path("photoreal_engine.py").exists())
    st.write("Photoreal UI:", Path("photoreal_ui.py").exists())
    st.write("Discovery Story engine:", Path("evidence_link_story.py").exists())
st.caption("Cartoon Studio V8 · Song → Story")
