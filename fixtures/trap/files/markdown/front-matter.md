---
title: <script>window.__trapped = 'front-matter'</script>
a: &a ["lol","lol","lol","lol","lol","lol","lol","lol","lol"]
b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]
c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]
d: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]
!!python/object/apply:os.system ["echo trapped"]
---

# After the Front Matter

+++
title = "a TOML block too"
+++

The text is here.
