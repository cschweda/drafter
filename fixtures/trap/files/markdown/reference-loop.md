# Reference Loops

[one][two] and [two][one] and [three][three].

[one]: #two
[two]: #one
[three]: [three]

[a][b][c][a][b][c][a][b][c][a][b][c][a][b][c][a][b][c]

[a]: [b]
[b]: [c]
[c]: [a]
