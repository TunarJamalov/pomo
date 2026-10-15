"""Microsoft Store screenshots (1920x1080) and the 16:9 hero art.

Render the views first, from pomo-desktop-rs, with demo data in a throwaway config:
  for v in timer history settings account; do
    POMO_SNAPSHOT=$OUT/$v.ppm POMO_VIEW=$v POMO_SCALE=2 POMO_RUNNING=1 XDG_CONFIG_HOME=$DEMO \
      cargo run --features snapshot; done
  POMO_SNAPSHOT=$OUT/mini.ppm POMO_VIEW=mini POMO_SIZE=360x440 POMO_SCALE=2 POMO_RUNNING=1 XDG_CONFIG_HOME=$DEMO \
    cargo run --features snapshot
  (cd $OUT && for f in *.ppm; do magick $f ${f%.ppm}.png; done)
Then run this from $OUT with the repo root in POMO_REPO. Needs ImageMagick 7.
"""
import os
import subprocess
REPO = os.environ.get("POMO_REPO", ".")
F = f"{REPO}/pomo-desktop-rs/ui/fonts"
LOGO = f"{REPO}/apps/web/public/logo.png"
def run(*a): subprocess.run(["magick",*a],check=True)

def background(out):
    run("-size","1920x1080","xc:#141518",
        "(","-size","1600x1600","radial-gradient:#f0533f40-#f0533f00",")","-geometry","+800-700","-composite",
        "(","-size","1200x1200","radial-gradient:#23a55a14-#23a55a00",")","-geometry","-500+500","-composite",out)

def window(src,width,out):
    run(src,"-resize",f"{width}x","win_r.png")
    h=int(subprocess.check_output(["magick","identify","-format","%h","win_r.png"]))
    run("-size",f"{width}x{h}","xc:none","-fill","white","-draw",f"roundrectangle 0,0,{width-1},{h-1},22,22","mask.png")
    run("win_r.png","mask.png","-alpha","off","-compose","CopyOpacity","-composite","-stroke","#ffffff21","-strokewidth","2","-fill","none",
        "-draw",f"roundrectangle 1,1,{width-2},{h-2},22,22","win_m.png")
    run("win_m.png","(","+clone","-background","black","-shadow","70x28+0+24",")","+swap","-background","none","-layers","merge","+repage",out)

def caption(base,title,sub,out,y=70):
    run(base,"-font",f"{F}/BricolageGrotesque-700.ttf","-pointsize","64","-fill","#f2f3f5","-gravity","north","-annotate",f"+0+{y}",title,
        "-font",f"{F}/Figtree-500.ttf","-pointsize","30","-fill","#b5bac1","-annotate",f"+0+{y+92}",sub,out)

shots=[("timer","Focus in one click","A clean Pomodoro timer that keeps your study streak alive on Discord."),
       ("history","Every session counts","Finished sessions sync to Pomo: water, XP and streak days."),
       ("account","Your Pomo profile, on your desktop","Connect Discord once. Level, streak and water at a glance."),
       ("settings","Light as a feather","About 25 MB of memory. Notifications, startup and Idle Guard built in.")]
for i,(name,title,sub) in enumerate(shots,1):
    background("bg.png"); window(f"{name}.png",1240,"w.png")
    caption("bg.png",title,sub,"cap.png")
    run("cap.png","w.png","-gravity","north","-geometry","+0+225","-composite","-crop","1920x1080+0+0","+repage",f"store-{i}-{name}.png")

# Mini mode floating over a dimmed, blurred timer window
background("bg.png"); window("timer.png",1500,"w.png")
run("w.png","-blur","0x6","-fill","#000000","-colorize","35%","wdim.png")
window("mini.png",380,"m.png")
caption("bg.png","Stays out of your way","Mini mode floats above your work. Start, pause and reset from the tray.","cap.png")
run("cap.png","wdim.png","-gravity","north","-geometry","+0+240","-composite","m.png","-gravity","northeast","-geometry","+330+330","-composite","-crop","1920x1080+0+0","+repage","store-5-mini.png")

# 16:9 hero art: no product name, just the logo and the timer
background("bg.png")
run(LOGO,"-resize","640x640","-fuzz","8%","-transparent","#1e1f37","logo_t.png")
window("mini.png",440,"m.png")
run("bg.png","logo_t.png","-gravity","west","-geometry","+260+0","-composite","m.png","-gravity","east","-geometry","+300+0","-composite","hero-1920x1080.png")
