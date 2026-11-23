# Szept w Ciemności

Mała gra horror w Pythonie (pygame). Chodzisz po ciemnym, losowo generowanym labiryncie z latarką, a w ciemności coś na ciebie poluje.

## Uruchomienie

```bash
pip install -r requirements.txt
python main.py
```

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD / strzałki | ruch |
| SHIFT | bieg (potwór go słyszy!) |
| Mysz | kierunek latarki |
| F / prawy przycisk myszy | włącz / wyłącz latarkę |
| R | restart po końcu gry |
| ESC | wyjście |

## Zasady

- Znajdź **3 klucze** i dotrzyj do **drzwi**.
- Latarka zużywa baterię. Zbieraj zapasowe baterie (zielone).
- Świeć potworowi prosto w oczy przez chwilę, a ucieknie. Ale światło widać z daleka, więc to ono go przyciąga.
- Kiedy słyszysz bicie serca i widzisz szum, potwór jest blisko.
- Labirynt jest za każdym razem inny.

Wszystkie dźwięki i grafiki są generowane w kodzie, więc nie są potrzebne żadne pliki zewnętrzne.
