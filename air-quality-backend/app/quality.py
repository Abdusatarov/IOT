def clean_values(measurement):
    # A triple zero is treated as a failed sample. Zero Celsius alone remains valid.
    if measurement.mq135_raw == 0 and measurement.temperature_c == 0 and measurement.humidity_pct == 0:
        return {'temperature_c': None, 'humidity_pct': None, 'mq135_raw': None}
    rules = {'temperature_c': (-40, 80), 'humidity_pct': (0, 100), 'mq135_raw': (1, 4095)}
    return {name: value if value is not None and low <= value <= high else None
            for name, (low, high) in rules.items() for value in [getattr(measurement, name)]}


def clean_output(data):
    result = dict(data)
    if all(result.get(name) == 0 for name in ('mq135_raw', 'temperature_c', 'humidity_pct')):
        result.update(mq135_raw=None, temperature_c=None, humidity_pct=None)
    for name, low, high in [('temperature_c', -40, 80), ('humidity_pct', 0, 100), ('mq135_raw', 1, 4095)]:
        value = result.get(name)
        if value is not None and not low <= value <= high:
            result[name] = None
    return result
