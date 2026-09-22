export type ExplainerCharacter = {
  id:string;
  name:string;
  role?:string;
  appearance:string;
  outfit:string;
  palette:string;
  personality?:string;
};

export type CharacterBible = {
  style:string;
  characters:ExplainerCharacter[];
  continuityRules:string[];
};

const DEFAULT_STYLE =
  "gold-linework watercolor editorial illustration, muted palette, cinematic 2D composition, hand-painted texture, consistent character design";

export function buildCharacterBible(topic:string, characters:ExplainerCharacter[]=[]):CharacterBible {
  return {
    style: DEFAULT_STYLE,
    characters,
    continuityRules: [
      "Characters are original to this explainer and are not taken from Cartoon Studios reusable character assets.",
      "When a character appears again, preserve the same face, hair, body proportions, outfit, accessories and palette.",
      "Do not redesign recurring characters between scenes.",
      "Keep the illustration style, line weight and lighting coherent across every scene.",
      "If no recurring character is needed, use environments, objects, diagrams and anonymous figures instead."
    ]
  };
}

export function characterPrompt(bible:CharacterBible):string {
  const characters=bible.characters.length
    ? bible.characters.map(c=>`${c.name}: ${c.appearance}; outfit: ${c.outfit}; palette: ${c.palette}; ${c.personality||""}`).join(" | ")
    : "No recurring named characters; do not introduce persistent character identities.";
  return `STYLE: ${bible.style}. CHARACTERS: ${characters}. CONTINUITY: ${bible.continuityRules.join(" ")}`;
}
