import { dayOfYear } from "../../lib/format";

// One line a day, the same all day, to start on a good note.
export const DAILY_LINES = [
  "Every wave is a chance to ride again. Let's make today a great one.",
  "Small strokes, steady rhythm, long distance. You've got this.",
  "The ocean rewards those who show up. Thanks for showing up today.",
  "Great crews are built one good day at a time. Let's have one.",
  "Eyes on the horizon, paddle in the water. Onward!",
  "Today's effort is tomorrow's momentum.",
  "Your work helps athletes chase their dreams. That matters.",
  "Start strong, finish proud.",
  "Good energy is contagious. Spread some today.",
  "Progress, not perfection. Let's move forward together.",
  "The tide is with you today. Make it count.",
  "Breathe in, paddle on. It's going to be a good day.",
  "Every order is someone's team getting ready to shine.",
  "Keep the good vibes flowing. They come back like the tide.",
];

// Quote of the day about business and success, the same all day. Only quotes with a well-known source.
export const QUOTES: [quote: string, author: string][] = [
  ["Stay hungry. Stay foolish.", "Steve Jobs"],
  ["Great things in business are never done by one person. They're done by a team of people.", "Steve Jobs"],
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Your most unhappy customers are your greatest source of learning.", "Bill Gates"],
  ["Price is what you pay. Value is what you get.", "Warren Buffett"],
  ["The biggest risk is not taking any risk.", "Mark Zuckerberg"],
  ["If you are not embarrassed by the first version of your product, you've launched too late.", "Reid Hoffman"],
  ["The best way to predict the future is to invent it.", "Alan Kay"],
  ["Chase the vision, not the money; the money will end up following you.", "Tony Hsieh"],
  ["Work hard, have fun, make history.", "Jeff Bezos"],
  ["I never dreamed about success. I worked for it.", "Estée Lauder"],
  ["Don't be afraid to give up the good to go for the great.", "John D. Rockefeller"],
  ["Well done is better than well said.", "Benjamin Franklin"],
  ["Energy and persistence conquer all things.", "Benjamin Franklin"],
  ["Knowing is not enough; we must apply. Willing is not enough; we must do.", "Johann Wolfgang von Goethe"],
  ["Talent wins games, but teamwork and intelligence win championships.", "Michael Jordan"],
  ["You miss 100% of the shots you don't take.", "Wayne Gretzky"],
  ["Start where you are. Use what you have. Do what you can.", "Arthur Ashe"],
  ["Alone we can do so little; together we can do so much.", "Helen Keller"],
  ["Ideas are easy. Implementation is hard.", "Guy Kawasaki"],
  ["Surround yourself with only people who are going to lift you higher.", "Oprah Winfrey"],
  ["Hard work beats talent when talent doesn't work hard.", "Tim Notke"],
  ["Patience, persistence and perspiration make an unbeatable combination for success.", "Napoleon Hill"],
  ["The best time to plant a tree was 20 years ago. The second best time is now.", "Proverb"],
];

export const dailyLine = (date = new Date()) => DAILY_LINES[dayOfYear(date) % DAILY_LINES.length];
export const quoteOfTheDay = (date = new Date()) => QUOTES[dayOfYear(date) % QUOTES.length];

export function greeting(firstName: string | null, date = new Date()) {
  const hour = date.getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return firstName ? `${part}, ${firstName}` : part;
}
