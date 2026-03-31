
import yfinance as yf
import json, sys

ticker = sys.argv[1]
try:
    t = yf.Ticker(ticker + '.NS')
    info = t.info
    result = {
        'pe':        info.get('trailingPE') or info.get('forwardPE'),
        'roce':      None,
        'debt_eq':   info.get('debtToEquity'),
        'net_profit':info.get('netIncomeToCommon'),
        'fcf':       info.get('freeCashflow'),
        'growth':    info.get('earningsGrowth'),
        'pledged':   None,
        'mktcap':    info.get('marketCap'),
        'cmp':       info.get('currentPrice') or info.get('regularMarketPrice'),
        'industry_pe': None,
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({}))
