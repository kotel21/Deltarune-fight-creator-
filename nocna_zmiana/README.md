# Nocna Zmiana: Galeria Manekin (edycja PORT)

Gra horror o przetrwaniu nocnej zmiany w opuszczonym centrum handlowym. Udaje „dziwny port z telefonu”: sztuczne ładowanie, reklamy w grze, pasek baterii telefonu, przyciski dotykowe, które nie działają, i kierownik, który pisze z błędami.

## Uruchomienie

```bash
pip install -r requirements.txt
python main.py
```

## Sterowanie

| Klawisz | Akcja |
|---|---|
| SPACJA (albo najechanie myszką na pasek na dole) | kamery |
| Q / E | lewe / prawe drzwi |
| A / D | lewe / prawe światło |
| 1–7 albo klik na mapie | wybór kamery |
| Mysz | przyciski, zamykanie reklam (czerwony X) |
| ENTER | pomiń wiadomość kierownika |
| ESC | menu |

## Przeciwnicy

- **Marek**: manekin, idzie lewym korytarzem. Rusza się tylko wtedy, kiedy na niego NIE patrzysz.
- **Basia**: manekin w czerwonej sukience, idzie prawą stroną przez toalety.
- **Pan Promocja**: maskotka w windzie (CAM 4). Musisz go oglądać. Kiedy usłyszysz DING, natychmiast zamknij lewe drzwi.
- **Reklamy**: wyskakują na kamerach. Trzeba je zamknąć, zanim skończy się czas.

Masz do przetrwania 5 nocy, od 12 AM do 6 AM (około 4,5 minuty każda). Drzwi, światło i kamery zużywają prąd. Kiedy prąd się skończy... powodzenia.

Postęp zapisuje się w pliku `zapis.json`.
