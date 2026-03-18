import json, sys

ticker = sys.argv[1]

try:
    import yfinance as yf
    t = yf.Ticker(ticker + '.NS')
    try:
        data = t.history(period='1y', interval='1d')
    except Exception:
        data = None

    if data is None or len(data) == 0:
        t2 = yf.Ticker(ticker + '.BO')
        try:
            data = t2.history(period='1y', interval='1d')
        except Exception:
            data = None

    if data is None or len(data) == 0:
        print('[]')
        sys.exit(0)

    rows = []
    for idx, row in data.iterrows():
        try:
            rows.append({
                'date':   str(idx.date()),
                'open':   round(float(row['Open']), 2),
                'high':   round(float(row['High']), 2),
                'low':    round(float(row['Low']), 2),
                'close':  round(float(row['Close']), 2),
                'volume': int(row['Volume'])
            })
        except Exception:
            continue

    print(json.dumps(rows))

except Exception:
    print('[]')
