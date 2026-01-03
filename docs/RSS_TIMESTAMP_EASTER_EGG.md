# RSS Timestamp Easter Egg

The RSS feed timestamps encode a hidden message for observant readers.

## Encoding Scheme

Each article's `<pubDate>` time (HH:MM) encodes two letters:
- **Hours** = first letter (A=01, B=02, ... Z=26)
- **Minutes** = second letter (A=01, B=02, ... Z=26)
- **Seconds** = always `00`

## Hidden Message

**"GOOD EYE TIMESTAMP SLEUTH"**

## Published Articles (0-6)

| Article | Title | Letters | Time | Date |
|---------|-------|---------|------|------|
| 0 | Your FPGA Lives a Lifetime While You Blink | GO | `07:15:00` | 2025-12-22 |
| 1 | Constraints: The Contract You Forgot to Sign | OD | `15:04:00` | 2025-12-23 |
| 2 | Understanding Timing Analysis | EY | `05:25:00` | 2025-12-28 |
| 3 | Pipelining Without Breaking Your Protocol | ET | `05:20:00` | 2025-12-30 |
| 4 | Silicon Real Estate: Your Resource Budget | IM | `09:13:00` | 2025-12-31 |
| 5 | CDC: Two Flip-Flops Are Not Magic | ES | `05:19:00` | 2026-01-02 |
| 6 | Resets: The Timing Event You Forgot | TA | `20:01:00` | 2026-01-03 |

## Future Articles (7-10)

| Article | Letters | Time |
|---------|---------|------|
| 7 | MP | `13:16:00` |
| 8 | SL | `19:12:00` |
| 9 | EU | `05:21:00` |
| 10 | TH | `20:08:00` |

## Decoding Table

```
A=01  B=02  C=03  D=04  E=05  F=06  G=07  H=08  I=09
J=10  K=11  L=12  M=13  N=14  O=15  P=16  Q=17  R=18
S=19  T=20  U=21  V=22  W=23  X=24  Y=25  Z=26
```

## Implementation

Article frontmatter dates include the time in ISO 8601 format:
```yaml
date: 2025-12-22T07:15:00Z
```

Hugo generates the RSS `<pubDate>` from this date, preserving the encoded time.
