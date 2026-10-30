// Who counts as in a scene, in one sentence that the scene page, a character's page, and the help
// index all say (seeing-the-script design §3, Calls 5 to 7). Its own module, with no imports, so a
// help page can show it without loading the cast.

/**
 * Who counts as in a scene: a mention counts, a voice-over counts as speaking, every name counts in
 * capitals only until the dictionary answers (and a name that is also a word, like Will, always),
 * and a name of two words or more counts only whole.
 */
export const PRESENCE_NOTE =
  'Someone is in a scene when they speak in it or their name is in its action: a mention counts as being there, and a voice-over, such as (V.O.), counts as speaking in the scene. Until the dictionary has answered, a name counts in the action only in capitals (TOM), and a name that is also an ordinary word, like Will or even Tom, always counts only so. A name of two words or more counts only as the whole name, never one word of it.';
