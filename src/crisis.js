// The same plain-words check the server makes, used on "test on your own" days when the server is not asked.
const CRISIS = /\b(kill(ing)? myself|end (it all|my life)|take my (own )?life|suicid\w*|want to die|don'?t want to (live|be alive)|hurt myself|self[- ]harm|cut myself|overdose|kill (him|her|them|someone)|matarme|suicidar|quitarme la vida|me tuer|me suicider|en finir avec (la|ma) vie)\b/i;
export const crisisWords = (text) => CRISIS.test(String(text || ""));
