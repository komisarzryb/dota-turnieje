# Team Spirit — Turnieje Dota 2

Strona pokazująca turnieje i mecze drużyny **Team Spirit** w DOTA 2.

## Uruchomienie

Otwórz `index.html` w przeglądarce albo uruchom lokalny serwer:

```
python -m http.server 8000
# lub
npx serve .
```

## Sekcje

- **Na żywo** — trwające mecze drużyny (odświeżane co 60 s).
- **Nadchodzące mecze** — zaplanowane spotkania (jeśli Liquipedia ogłosi harmonogram).
- **Turnieje i wyniki** — osiągnięcia: miejsce, turniej, wynik i wygrana (Liquipedia).
- **Ostatnie mecze** — ostatnie spotkania z wynikami i linkami do VOD (Liquipedia).
- **Historia turniejów** — wszystkie turnieje z ostatnich 2 lat pogrupowane po ligach, z bilansem W/L i listą meczów (OpenDota).

## Źródła danych

- **OpenDota API** (`api.opendota.com`) — informacje o drużynie, historia meczów, mecze na żywo, poziomy lig. Drużyna Team Spirit: `team_id 7119388`.
- **Liquipedia** (`liquipedia.net/dota2`) — wyniki turniejów, ostatnie mecze, nadchodzący harmonogram dla strony `Team_Spirit`.

API są darmowe, ale mają limity zapytań — dane pobierane są bezpośrednio z przeglądarki, bez backendu.

## Struktura

- `index.html` — układ strony
- `style.css` — ciemny motyw
- `app.js` — pobieranie i renderowanie danych

Strona jest nieoficjalna i niezwiązana z Valve ani Team Spirit.