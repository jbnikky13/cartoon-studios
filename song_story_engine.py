"""Cartoon Studio Song -> Story pipeline."""
from __future__ import annotations
import json, os, re
import requests
import streamlit as st

LRCLIB_API = "https://lrclib.net/api"
LRCLIB_UA = "CartoonStudio/8.0 (https://github.com/jbnikky13/cartoon-studios)"
MINIMAX_URL = "https://api.minimax.io/v1/text/chatcompletion_v2"

ACTIONS = {
    "idle":"Idle","walk":"Walk","walking":"Walk","walk_in":"Walk In","enter":"Walk In",
    "run":"Run","jump":"Jump","dance":"Dance","celebrate":"Celebrate","crouch":"Crouch",
    "sit":"Crouch","exit":"Exit Right","leave":"Exit Right","talk":"Talk","speak":"Talk",
    "look":"Look","look_right":"Look Right","look_left":"Look Left","turn":"Turn",
    "point":"Point","wave":"Wave","hug":"Hug","think":"Think","cry":"Cry","laugh":"Laugh",
    "react":"React","surprised":"Surprised","angry":"Angry","sad":"Sad"
}

def secret(name, default=""):
    value = os.getenv(name, default)
    try: value = st.secrets.get(name, value)
    except Exception: pass
    return str(value or "").strip()

def fetch_lyrics(title, artist):
    headers={"User-Agent":LRCLIB_UA,"Accept":"application/json"}
    params={"track_name":title.strip(),"artist_name":artist.strip()}
    if not params["track_name"] or not params["artist_name"]:
        raise ValueError("Enter both the song title and artist.")
    r=requests.get(f"{LRCLIB_API}/get",params=params,headers=headers,timeout=20)
    if r.status_code==200: return r.json()
    if r.status_code not in (400,404): r.raise_for_status()
    r=requests.get(f"{LRCLIB_API}/search",params=params,headers=headers,timeout=20)
    r.raise_for_status()
    rows=r.json()
    if not rows: raise LookupError(f"No lyrics record found for {artist} — {title}.")
    exact=next((x for x in rows if x.get("artistName","").lower()==artist.lower() and x.get("trackName","").lower()==title.lower()),rows[0])
    return exact

def parse_synced(text):
    if not text: return []
    out=[]
    rx=re.compile(r"\[(\d+):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)")
    for line in text.splitlines():
        m=rx.match(line.strip())
        if not m: continue
        frac=m.group(3) or "0"
        scale={1:10,2:100,3:1000}.get(len(frac),1)
        out.append((int(m.group(1))*60+int(m.group(2))+int(frac)/scale,m.group(4).strip()))
    return [(t,x) for t,x in out if x]

def clean_json(text):
    text=re.sub(r"^\s*```(?:json)?\s*","",text.strip(),flags=re.I)
    text=re.sub(r"\s*```\s*$","",text)
    a,b=text.find("{"),text.rfind("}")
    return text[a:b+1] if a>=0 and b>a else text

def ai_story(title,artist,lyrics,duration):
    key=secret("MINIMAX_API_KEY")
    if not key: raise RuntimeError("MINIMAX_API_KEY is not configured.")
    system="""You are Cartoon Studio's AI Director. Analyze a song's meaning and create an original animated story. Do not reproduce lyrics in the answer. Return JSON only.
Schema:
{"story_title":"","mode":"story|emotion|performance|hybrid","logline":"","theme":"","emotional_arc":[],"characters":[{"role":"","description":""}],"scenes":[{"number":1,"title":"","start":0,"end":5,"summary":"","emotion":"","setting":"","camera":"","characters":[],"actions":[{"character":"","action":"","emotion":"","gesture":"","look_at":""}]}]}
Actions must be physical and executable by a lightweight 2D character engine. Prefer: idle, walk_in, walk, run, jump, dance, crouch, exit, talk, look, look_right, look_left, turn, point, wave, hug, think, cry, laugh, react, surprised, angry, sad."""
    user=f"""Song: {title} — {artist}
Approximate duration: {duration:.1f}s
Analyze these lyrics and turn their meaning into a coherent beginning-middle-end animated story:
{lyrics[:50000]}"""
    r=requests.post(MINIMAX_URL,headers={"Authorization":f"Bearer {key}","Content-Type":"application/json"},json={"model":os.getenv("CARTOON_STORY_MODEL","MiniMax-M3"),"messages":[{"role":"system","content":system},{"role":"user","content":user}],"temperature":0.7,"max_tokens":7000,"stream":False},timeout=120)
    r.raise_for_status()
    p=r.json()
    text=p.get("choices",[{}])[0].get("message",{}).get("content","")
    if not text: raise RuntimeError("MiniMax returned no story.")
    return json.loads(clean_json(text))

def fallback_story(title,artist,lyrics,duration):
    t=lyrics.lower()
    sad=any(x in t for x in ("miss","lost","alone","cry","tears","goodbye","pain","without you"))
    love=any(x in t for x in ("love","heart","baby","kiss","together","forever"))
    energy=any(x in t for x in ("dance","party","fire","move","tonight","celebrate"))
    theme="love, loss and moving forward" if sad and love else "connection and desire" if love else "freedom and celebration" if energy else "a character confronting change"
    mode="story" if sad or love else "hybrid" if energy else "emotion"
    step=max(5.0,(duration or 40)/5)
    specs=[
      ("The Beginning","Introduce the protagonist and world.","Neutral","Street","Wide","walk_in","look"),
      ("The Feeling","Introduce the central relationship or desire.","Happy" if love else "Thinking","Street","Medium","walk","look_right"),
      ("The Turning Point","The song's conflict becomes visible.","Sad" if sad else "Surprised","Apartment","Close-up","turn","react"),
      ("The Choice","The protagonist decides how to respond.","Thinking","Rooftop","Medium","think","walk"),
      ("The Ending","The protagonist moves forward.","Happy" if not sad else "Sad","Street","Wide","walk","exit")
    ]
    scenes=[]
    for i,(name,summary,emotion,setting,camera,a,b) in enumerate(specs,1):
        start=(i-1)*step; end=min(duration or i*step,i*step)
        scenes.append({"number":i,"title":name,"start":round(start,2),"end":round(end,2),"summary":summary,"emotion":emotion,"setting":setting,"camera":camera,"characters":["Protagonist","Second Character"],"actions":[{"character":"Protagonist","action":a,"emotion":emotion,"gesture":"Talking Hands","look_at":"Second Character"},{"character":"Second Character","action":b,"emotion":"Neutral","gesture":"None","look_at":"Protagonist"}]})
    return {"story_title":f"{title} — Cartoon Story","mode":mode,"logline":f"An original animated story inspired by the themes of {title} by {artist}.","theme":theme,"emotional_arc":["connection","conflict","turning point","acceptance"],"characters":[{"role":"Protagonist","description":"Central character experiencing the song's emotional journey."},{"role":"Second Character","description":"Supporting character representing the relationship, memory or conflict."}],"scenes":scenes}

def generate_story(title,artist,lyrics,duration):
    try: return ai_story(title,artist,lyrics,duration),"MiniMax AI Director"
    except Exception as exc: return fallback_story(title,artist,lyrics,duration),f"Local fallback ({type(exc).__name__})"

def normalize_action(action):
    return ACTIONS.get(str(action or "idle").lower().strip().replace(" ","_").replace("-","_"),"Idle")

def build_timelines(story,mapping):
    result={name:[] for name in mapping.values()}
    for scene in story.get("scenes",[]):
        start=float(scene.get("start",0)); end=float(scene.get("end",start+2))
        for item in scene.get("actions",[]):
            target=mapping.get(str(item.get("character","")).strip())
            if not target: continue
            action=normalize_action(item.get("action"))
            emotion=str(item.get("emotion","")).strip()
            gesture=str(item.get("gesture","")).strip()
            cue=action + (f" | emotion={emotion}" if emotion else "") + (f" | gesture={gesture}" if gesture else "")
            result.setdefault(target,[]).append(f"{start:g}-{end:g}: {cue}")
    return {k:"\n".join(v) for k,v in result.items()}

def render_song_story():
    st.header("🎵 Song → Story")
    st.caption("Song title + artist → lyrics → story → storyboard → executable character actions.")
    c1,c2=st.columns([1.3,1])
    with c1: title=st.text_input("Song title",placeholder="Song title",key="song_title")
    with c2: artist=st.text_input("Artist",placeholder="Artist",key="song_artist")
    if st.button("🔎 Find Song & Lyrics",type="primary",use_container_width=True):
        try:
            st.session_state.song_data=fetch_lyrics(title,artist)
            st.session_state.song_error=""
        except Exception as exc: st.session_state.song_error=str(exc)
    if st.session_state.get("song_error"): st.error(st.session_state.song_error)
    data=st.session_state.get("song_data")
    if not data:
        st.info("Enter a song title and artist. For final rendering, provide audio you are authorized to use.")
        return
    lines=parse_synced(data.get("syncedLyrics"))
    duration=float(data.get("duration") or (lines[-1][0] if lines else 40))
    lyrics=data.get("plainLyrics") or "\n".join(x[1] for x in lines)
    st.success(f"Found: {data.get('artistName',artist)} — {data.get('trackName',title)}")
    st.caption(f"Album: {data.get('albumName') or 'Unknown'} · {duration:.1f}s · Lyrics source: LRCLIB")
    if lyrics:
        with st.expander("📖 Lyrics used for analysis"):
            st.text_area("Lyrics",lyrics,height=220,disabled=True,key="song_lyrics_view")
    if st.button("🧠 Derive Story from Song",type="primary",use_container_width=True):
        with st.spinner("AI Director is deriving the story and character actions..."):
            story,source=generate_story(title,artist,lyrics,duration)
        st.session_state.song_story=story
        st.session_state.song_story_source=source
    story=st.session_state.get("song_story")
    if not story: return
    st.success(f"Story engine: {st.session_state.get('song_story_source')}")
    st.subheader("🎬 Story")
    st.markdown(f"**{story.get('story_title','Untitled')}**")
    st.write(story.get("logline",""))
    st.write("**Theme:**",story.get("theme",""))
    st.write("**Emotional arc:**"," → ".join(story.get("emotional_arc",[])))
    try:
        import classic_cartoon_ui as classic
        names=list(classic.CHARACTERS.keys())
    except Exception: names=[]
    roles=[x.get("role","Character") for x in story.get("characters",[])]
    mapping={}
    if roles and names:
        st.subheader("🎭 Cast")
        cols=st.columns(min(3,len(roles)))
        for i,role in enumerate(roles):
            with cols[i%len(cols)]: mapping[role]=st.selectbox(role,names,index=i%len(names),key=f"song_cast_{i}")
        st.session_state.song_mapping=mapping
    st.subheader("🎞️ Storyboard")
    for s in story.get("scenes",[]):
        with st.expander(f"Scene {s.get('number')}: {s.get('title')} · {float(s.get('start',0)):g}–{float(s.get('end',0)):g}s"):
            st.write(s.get("summary",""))
            st.caption(f"Emotion: {s.get('emotion','')} · Setting: {s.get('setting','')} · Camera: {s.get('camera','')}")
            for a in s.get("actions",[]): st.write(f"**{a.get('character','Character')}** → {a.get('action','idle')} · {a.get('emotion','Neutral')} · {a.get('gesture','')}")
    if mapping and st.button("⚙️ Build Character Action Timelines",use_container_width=True):
        st.session_state.song_timelines=build_timelines(story,mapping)
    timelines=st.session_state.get("song_timelines")
    if timelines:
        st.subheader("🎭 Executable Character Actions")
        for name,timeline in timelines.items(): st.code(timeline or "Idle")
        if st.button("📥 Load Timelines into Classic Cartoon",type="primary",use_container_width=True):
            for name,timeline in timelines.items():
                st.session_state[f"v6_timeline_{name}"]=timeline
                st.session_state[f"v6_action_{name}"]="Idle"
            st.session_state.song_story_loaded=True
            st.success("Loaded. Open 🎭 Classic Cartoon and render with these character timelines.")
    project={"song":{"title":title,"artist":artist,"duration":duration,"lyrics_source":"LRCLIB"},"story":story,"mapping":mapping,"timelines":timelines or {}}
    st.download_button("⬇️ Download Story Project JSON",json.dumps(project,indent=2),file_name="cartoon_song_story.json",mime="application/json")
