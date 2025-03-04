import React, { useState, useEffect } from 'react';
import { Container, Table, Button, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import axios from 'axios';

const AppList = ({ token }) => {
  const [apps, setApps] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/customers/applications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('Backend response:', response.data); // Yanıtı konsola yazdır
        if (Array.isArray(response.data)) {
          setApps(response.data);
        } else {
          setApps([]);
          setError(`Unexpected response format from server: ${JSON.stringify(response.data)}`);
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch applications');
        setApps([]);
      }
    };
    fetchApps();
  }, [token]);

  return (
    <Container className="py-4">
      <h1 className="mb-4">Applications</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      <Button as={Link} to="/dashboard/apps/create" variant="primary" className="mb-4">New Application</Button>
      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Integration ID</th>
            <th>Name</th>
            <th>Platform</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {apps.length > 0 ? (
            apps.map(app => (
              <tr key={app.id}>
                <td>{app.app_id}</td>
                <td>{app.name}</td>
                <td>{app.platform}</td>
                <td>{new Date(app.created_at).toLocaleString()}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="4">No applications found</td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
};

export default AppList;