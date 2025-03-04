// src/components/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Container, Navbar, Nav, Table, Button, Row, Col } from 'react-bootstrap'; // Card’ı kaldır
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import axios from 'axios';
import CampaignCreate from './CampaignCreate'; // Yeni kampanya oluşturma componenti
import Profile from './Profile'; // Profil componenti
import AppCreate from './AppCreate'; // Uygulama ekleme componenti
import AppList from './AppList'; // Uygulama listeleme componenti

const Dashboard = ({ token, handleLogout }) => {
  const [campaigns, setCampaigns] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/campaigns', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCampaigns(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        console.error('Error fetching campaigns:', err);
        setCampaigns([]);
      }
    };
    fetchCampaigns();
  }, [token]);

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand as={Link} to="/">PushXAI</Navbar.Brand>
          <Navbar.Toggle aria-controls="dashboard-nav" />
          <Navbar.Collapse id="dashboard-nav">
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/dashboard">Campaigns</Nav.Link>
              <Nav.Link as={Link} to="/dashboard/audience">Audience</Nav.Link>
              <Nav.Link as={Link} to="/dashboard/apps">Apps</Nav.Link>
              <Nav.Link as={Link} to="/dashboard/settings">Settings</Nav.Link>
              <Nav.Link as={Link} to="/dashboard/profile">Profile</Nav.Link>
            </Nav>
            <Button variant="outline-light" onClick={() => { handleLogout(); navigate('/'); }}>Logout</Button>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="py-4">
        <Routes>
          <Route path="/" element={
            <>
              <Row className="mb-4">
                <Col>
                  <h1 className="mb-3">Dashboard</h1>
                  <Button as={Link} to="/dashboard/create" variant="primary">New Campaign</Button>
                </Col>
              </Row>
              <h2 className="mb-3">Campaigns</h2>
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Message</th>
                    <th>Sent</th>
                    <th>Delivered</th>
                    <th>Opened</th>
                    <th>Errors</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.length > 0 ? campaigns.map(camp => (
                    <tr key={camp.id}>
                      <td>{camp.title}</td>
                      <td>{camp.message}</td>
                      <td>{camp.sent || 0}</td>
                      <td>{camp.delivered || 0}</td>
                      <td>{camp.opened || 0}</td>
                      <td>{camp.errors || 0}</td>
                      <td>{new Date(camp.created_at).toLocaleString()}</td>
                    </tr>
                  )) : <tr><td colSpan="7">No campaigns found</td></tr>}
                </tbody>
              </Table>
            </>
          } />
          <Route path="/create" element={<CampaignCreate token={token} />} />
          <Route path="/profile" element={<Profile token={token} />} />
          <Route path="/apps" element={<AppList token={token} />} />
          <Route path="/apps/create" element={<AppCreate token={token} />} />
          <Route path="/audience" element={<div>Audience - Coming Soon</div>} />
          <Route path="/settings" element={<div>Settings - Coming Soon</div>} />
        </Routes>
      </Container>
    </>
  );
};

export default Dashboard;