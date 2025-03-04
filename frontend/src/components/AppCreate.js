import React, { useState } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import axios from 'axios';

const AppCreate = ({ token }) => {
  const [formData, setFormData] = useState({
    name: '',
    platform: '',
    credentials: {}
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleChange = (e) => {
    if (e.target.name.startsWith('credentials.')) {
      const key = e.target.name.split('.')[1];
      setFormData({
        ...formData,
        credentials: { ...formData.credentials, [key]: e.target.value }
      });
    } else {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();

    reader.onload = (event) => {
      const fileContent = event.target.result;
      const key = e.target.name.split('.')[1];

      if (key === 'service_account') {
        // Service Account JSON’ını minify et
        try {
          const json = JSON.parse(fileContent);
          const minifiedJson = JSON.stringify(json);
          setFormData({
            ...formData,
            credentials: { ...formData.credentials, [key]: minifiedJson, type: 'fcm' }
          });
        } catch (err) {
          setError('Invalid JSON file');
        }
      } else {
        // p8 ve p12 için base64’e çevir
        const base64Content = fileContent.split(',')[1]; // Data URI’dan base64’ü al
        setFormData({
          ...formData,
          credentials: { ...formData.credentials, [key]: base64Content }
        });
      }
    };

    if (file) {
      if (file.name.endsWith('.json')) {
        reader.readAsText(file); // JSON için metin oku
      } else {
        reader.readAsDataURL(file); // p8/p12 için base64
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:3000/api/customers/applications', {
        ...formData,
        customer_id: 1 // JWT’den dinamik alınabilir
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('Application added successfully');
      setError('');
      setFormData({ name: '', platform: '', credentials: {} });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add application');
      setSuccess('');
    }
  };

  return (
    <Container className="py-4">
      <h1 className="mb-4">Add Application</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <Form onSubmit={handleSubmit}>
        <Form.Group controlId="name" className="mb-3">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="App Name"
          />
        </Form.Group>
        <Form.Group controlId="platform" className="mb-3">
          <Form.Label>Platform</Form.Label>
          <Form.Select name="platform" value={formData.platform} onChange={handleChange}>
            <option value="">Select Platform</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
            <option value="web">Web</option>
          </Form.Select>
        </Form.Group>

        {formData.platform === 'android' && (
          <Form.Group controlId="credentials.service_account" className="mb-3">
            <Form.Label>FCM Service Account JSON</Form.Label>
            <Form.Control
              type="file"
              name="credentials.service_account"
              accept=".json"
              onChange={handleFileChange}
            />
          </Form.Group>
        )}

        {formData.platform === 'ios' && (
          <>
            <Form.Group controlId="credentials.type" className="mb-3">
              <Form.Label>Credential Type</Form.Label>
              <Form.Select name="credentials.type" value={formData.credentials.type || ''} onChange={handleChange}>
                <option value="">Select Type</option>
                <option value="p12">p12</option>
                <option value="p8">p8</option>
              </Form.Select>
            </Form.Group>
            {formData.credentials.type === 'p12' && (
              <>
                <Form.Group controlId="credentials.certificate" className="mb-3">
                  <Form.Label>p12 Certificate</Form.Label>
                  <Form.Control
                    type="file"
                    name="credentials.certificate"
                    accept=".p12"
                    onChange={handleFileChange}
                  />
                </Form.Group>
                <Form.Group controlId="credentials.password" className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.password"
                    value={formData.credentials.password || ''}
                    onChange={handleChange}
                    placeholder="Certificate Password"
                  />
                </Form.Group>
              </>
            )}
            {formData.credentials.type === 'p8' && (
              <>
                <Form.Group controlId="credentials.key" className="mb-3">
                  <Form.Label>p8 Key</Form.Label>
                  <Form.Control
                    type="file"
                    name="credentials.key"
                    accept=".p8"
                    onChange={handleFileChange}
                  />
                </Form.Group>
                <Form.Group controlId="credentials.key_id" className="mb-3">
                  <Form.Label>Key ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.key_id"
                    value={formData.credentials.key_id || ''}
                    onChange={handleChange}
                    placeholder="Key ID"
                  />
                </Form.Group>
                <Form.Group controlId="credentials.team_id" className="mb-3">
                  <Form.Label>Team ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.team_id"
                    value={formData.credentials.team_id || ''}
                    onChange={handleChange}
                    placeholder="Team ID"
                  />
                </Form.Group>
              </>
            )}
            <Form.Group controlId="credentials.bundle_id" className="mb-3">
              <Form.Label>Bundle ID</Form.Label>
              <Form.Control
                type="text"
                name="credentials.bundle_id"
                value={formData.credentials.bundle_id || ''}
                onChange={handleChange}
                placeholder="Bundle ID"
              />
            </Form.Group>
          </>
        )}

        {formData.platform === 'web' && (
          <>
            <Form.Group controlId="credentials.type" className="mb-3">
              <Form.Label>Credential Type</Form.Label>
              <Form.Select name="credentials.type" value={formData.credentials.type || ''} onChange={handleChange}>
                <option value="">Select Type</option>
                <option value="vapid">VAPID</option>
                <option value="p12">Safari p12</option>
              </Form.Select>
            </Form.Group>
            {formData.credentials.type === 'vapid' && (
              <>
                <Form.Group controlId="credentials.public_key" className="mb-3">
                  <Form.Label>VAPID Public Key</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.public_key"
                    value={formData.credentials.public_key || ''}
                    onChange={handleChange}
                    placeholder="Public Key"
                  />
                </Form.Group>
                <Form.Group controlId="credentials.private_key" className="mb-3">
                  <Form.Label>VAPID Private Key</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.private_key"
                    value={formData.credentials.private_key || ''}
                    onChange={handleChange}
                    placeholder="Private Key"
                  />
                </Form.Group>
              </>
            )}
            {formData.credentials.type === 'p12' && (
              <>
                <Form.Group controlId="credentials.certificate" className="mb-3">
                  <Form.Label>Safari p12 Certificate</Form.Label>
                  <Form.Control
                    type="file"
                    name="credentials.certificate"
                    accept=".p12"
                    onChange={handleFileChange}
                  />
                </Form.Group>
                <Form.Group controlId="credentials.password" className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.password"
                    value={formData.credentials.password || ''}
                    onChange={handleChange}
                    placeholder="Certificate Password"
                  />
                </Form.Group>
                <Form.Group controlId="credentials.bundle_id" className="mb-3">
                  <Form.Label>Bundle ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="credentials.bundle_id"
                    value={formData.credentials.bundle_id || ''}
                    onChange={handleChange}
                    placeholder="Bundle ID"
                  />
                </Form.Group>
              </>
            )}
          </>
        )}
        <Button type="submit" variant="primary">Add Application</Button>
      </Form>
    </Container>
  );
};

export default AppCreate;