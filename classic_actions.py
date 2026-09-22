"""True actions + per-character timeline adapter for Classic Cartoon."""
import math

ACTION_PRESETS=["Idle","Walk In","Walk","Run","Jump","Dance","Celebrate","Crouch","Slide Left","Slide Right","Exit Right","Talk","Wave","Point","Think","Look","Look Right","Look Left","Turn","Hug","Cry","Laugh","React","Surprised","Angry","Sad"]

def action_offsets(action,t,seed=0):
    a=(action or "Idle").lower(); dx=dy=rot=0.0; posture=None
    if a=="walk in":
        p=min(1.0,max(0.0,t/1.6)); ease=p*p*(3-2*p); dx=-0.38+0.38*ease; dy=-abs(math.sin(t*9+seed))*.012; rot=math.sin(t*9+seed)*2
    elif a=="walk": dx=.055*t; dy=-abs(math.sin(t*8+seed))*.012; rot=math.sin(t*8+seed)*2.2
    elif a=="run": dx=.12*t; dy=-abs(math.sin(t*13+seed))*.025; rot=math.sin(t*13+seed)*4
    elif a=="jump": p=(t*1.1+seed*.1)%1; dy=-(4*p*(1-p))*120; rot=math.sin(p*math.pi)*3
    elif a=="dance": dx=math.sin(t*5.5+seed)*22; dy=-abs(math.sin(t*5.5+seed))*12; rot=math.sin(t*5.5+seed)*7
    elif a=="celebrate": dy=-abs(math.sin(t*5+seed))*18; rot=math.sin(t*7+seed)*4
    elif a=="crouch": dy=35+math.sin(t*2+seed)*4; posture="Sitting"
    elif a=="slide left": dx=-120*min(1,t/1.2)
    elif a=="slide right": dx=120*min(1,t/1.2)
    elif a=="exit right": dx=.55*min(1,max(0,t/1.8)); dy=-abs(math.sin(t*9+seed))*.012; rot=math.sin(t*9+seed)*2
    elif a in ("talk","think","look","look right","look left","turn","react","surprised","angry","sad","cry","laugh","wave","point","hug"): dy=-abs(math.sin(t*5+seed))*.008; rot=math.sin(t*3+seed)*1.2
    return dx,dy,rot,posture

def patch_classic_module(classic_module):
    original=getattr(classic_module,"draw_rigged_character",None)
    if original is None or getattr(original,"_v6_actions_patched",False): return
    def wrapped(draw,name,cx,ground,frame,seed,expression="Neutral",posture="Standing",gesture="Talking Hands",talking=False,look_x=None,scale=1.0,style="Bold 2D Comedy",mouth_frame=None):
        action="Idle"
        try:
            import streamlit as st
            timeline=st.session_state.get(f"v6_timeline_{name}","")
            if timeline:
                from timeline_actions import active_action
                action,_=active_action(timeline,frame/24.0,"Idle")
            else: action=st.session_state.get(f"v6_action_{name}","Idle")
        except Exception: pass
        parts=[p.strip() for p in str(action).split("|")]
        action=parts[0] if parts else "Idle"
        meta={}
        for part in parts[1:]:
            if "=" in part:
                k,v=part.split("=",1); meta[k.strip().lower()]=v.strip()
        al=action.lower()
        expression_map={"sad":"Sad","cry":"Sad","angry":"Annoyed","surprised":"Surprised","laugh":"Laughing","think":"Thinking","hug":"Happy"}
        gesture_map={"talk":"Talking Hands","wave":"Waving","point":"Pointing","think":"Thinking","hug":"Shrugging","laugh":"Laughing","cry":"Nervous","sad":"Thinking"}
        expression=meta.get("emotion",expression_map.get(al,expression))
        gesture=meta.get("gesture",gesture_map.get(al,gesture))
        talking=talking or al in ("talk","speak")
        dx,dy,rot,posture_override=action_offsets(action,frame/24.0,seed)
        if posture_override: posture=posture_override
        return original(draw,name,cx+dx,ground+dy,frame,seed,expression=expression,posture=posture,gesture=gesture,talking=talking,look_x=look_x,scale=scale,style=style,mouth_frame=mouth_frame)
    wrapped._v6_actions_patched=True
    classic_module.draw_rigged_character=wrapped
