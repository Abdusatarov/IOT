def test_new_frontend_and_removed_archive(client):
    response = client.get('/')
    assert response.status_code == 200
    assert 'id="root"' in response.text
    assert '/assets/' in response.text
    assert client.get('/web/dashboard.html').status_code == 404
    assert client.get('/web/api.js').status_code == 404
    assert client.get('/web/map-2gis.html').status_code == 404
    assert client.get('/web/../../.env').status_code == 404
