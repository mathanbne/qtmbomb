# QTM Pass the Bomb

A live party game for QTM events. Players scan a QR code, type their first name and get a number. Each round, bombs land on random phones. Whoever has a bomb taps **PASS** to throw it to another random player. Anyone holding a bomb when the countdown hits zero hears the blast 💥 and is out. Rounds repeat until one player is left: the winner.

| Page | Who | What |
|---|---|---|
| `/` | Players (phones) | Join → number → PASS when the bomb lands on you |
| `/admin` | Host (laptop) | Open joining, pick 15s/30s, start rounds, remove players, export results |
| `/screen` | Projector | Join QR, giant countdown, who has the bombs, the blast, the winner |
| `/board` | Second screen / anyone's phone | Every player as a tile: green = in, red 💣 = holding a bomb, grey = out |
| `/poster` | Print | A4 poster and table tent with the QR code |

This app is completely separate from Tambola and the quiz game. It has its own Firebase project.

## How a round works

- **Bombs per round**: one for every 8 players still in (the host can change this ratio). Never fewer than 1, and always fewer bombs than players. 300 players get 37 bombs, 40 players get 5, and 15 or fewer get 1. With 300 players and 30-second rounds, a game takes about 25–30 minutes.
- **When a bomb lands on a phone**: an alarm sounds, Android phones vibrate and the screen flashes red. **PASS** works once the player has held the bomb for 1 second. Each pass goes to a random player who is still in, isn't already holding a bomb, and (where possible) didn't just pass it to them.
- **Ticking**: plays on the holder's phone and on the projector, and speeds up in the last 5 seconds.
- **At zero**: the Firestore server clock decides. A pass that reaches the server after zero is rejected. A second later, the host page reads where every bomb is and knocks those players out.
- **Asleep or gone**: a phone that is asleep or has left the game can't pass, so its player goes out. Absent players drop out on their own.
- **Shared win**: if the last players all explode together, they share the win. With the default settings this can't happen.

## One-time setup

1. **Create a Firebase project**, e.g. `qtm-bomb`, at https://console.firebase.google.com.
   - Upgrade to the **Blaze** (pay-as-you-go) plan. A 300-player game is about 1M reads, which costs about US$0.60.
2. **Firestore**: Build → Firestore Database → Create database (choose `australia-southeast1`).
3. **Authentication**: Build → Authentication → Sign-in method. Enable **Anonymous** (for players and screens) and **Email/Password** (for the host).
4. **Create the host account**: Authentication → Users → Add user. Copy the user's **UID**.
5. **Mark them as host**: Firestore → Start collection `hosts` → Document ID = that UID → add any field (e.g. `name: "QTM host"`).
6. **Web app config**: Project settings → Your apps → Add web app. Copy the values into `.env.local` for local development (the names are in `.env.example`).
7. **Deploy the database rules**:
   ```
   npm install -g firebase-tools
   firebase login
   firebase use --add                        # pick the qtm-bomb project
   firebase deploy --only firestore:rules
   ```
   Run the last line again whenever `firestore.rules` changes.
8. **Host the site on Vercel**: Add New → Project → import the GitHub repo (Vite is detected automatically). Before the first deploy, add every `VITE_*` value from step 6 under Environment Variables, plus `VITE_PUBLIC_URL=https://bomb.qtm.org.au`.
9. **Domain**: Vercel project → Settings → Domains → add `bomb.qtm.org.au`, then add the DNS record Vercel shows you. In Firebase, add `bomb.qtm.org.au` under Authentication → Settings → Authorized domains.

## Running an event

1. On the laptop, open `/admin` and sign in. Put `/screen` on the projector and click **Sound on** once. Optionally, open `/board` on a second screen.
2. Tick **Joining is open**. People scan the QR code (projector or printed `/poster`) and join. Numbers are handed out in join order. **The admin tab must stay open.** It hands out the numbers and sets off the bombs.
3. Choose **15s** or **30s**, then press **Start round 1**. This closes joining.
4. After each blast, press **Start round 2**, **3**, and so on. To run hands-free, tick **Auto-start next round** (8-second break).
5. To take someone out (duplicate, prank name, went home), press **✕** next to them in the player list.
6. **Export results** downloads a CSV with everyone's place. **Reset…** starts a fresh game.

**Tell players:** turn the volume up, turn silent mode off, and keep the page open. Their screen stays awake. If they reload, they keep their number. If the page shows **🔇 Tap for sound**, they should tap it.

## Development

```
npm install
npm run dev        # http://localhost:5173
npm test           # game rules
npm run build
```

When you run `npm run dev`, the admin page has a **DEV: +50 fake players** button. Use it to fill the projector and board with a full room. Fake players have no phone, so they explode if a bomb lands on them.

Code layout:

- `src/lib/game.ts`: bomb count, bomb placement, pass target, explosion and results (pure, unit tested)
- `src/lib/api.ts`: all Firestore reads and writes
- `src/lib/clock.ts`: server-clock offset so every countdown matches
- `src/lib/sound.ts`: alarm, tick, whoosh, blast and fanfare (Web Audio, no sound files)
- `firestore.rules`: only the holder can pass, only to players still in, only before zero; only the host runs the game
- `src/pages/`: Player, Admin, Screen, Board, Poster
