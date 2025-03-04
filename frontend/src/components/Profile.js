import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import axios from 'axios';

const Profile = ({ token }) => {
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/customers/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFormData(response.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch profile');
      }
    };
    fetchProfile();
  }, [token]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await axios.put('http://localhost:3000/api/customers/profile', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('Profile updated successfully');
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
      setSuccess('');
    }
  };

  return (
    <Container className="py-4">
      <h1 className="mb-4">Profile</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      <Form onSubmit={handleUpdate}>
        <Form.Group controlId="phone" className="mb-3">
          <Form.Label>Phone</Form.Label>
          <Form.Control type="text" name="phone" value={formData.phone || ''} onChange={handleChange} placeholder="Enter phone" />
        </Form.Group>
        <Form.Group controlId="address" className="mb-3">
          <Form.Label>Address</Form.Label>
          <Form.Control type="text" name="address" value={formData.address || ''} onChange={handleChange} placeholder="Enter address" />
        </Form.Group>
        <Form.Group controlId="firstName" className="mb-3">
          <Form.Label>First Name</Form.Label>
          <Form.Control type="text" name="first_name" value={formData.first_name || ''} onChange={handleChange} placeholder="Enter first name" />
        </Form.Group>
        <Form.Group controlId="lastName" className="mb-3">
          <Form.Label>Last Name</Form.Label>
          <Form.Control type="text" name="last_name" value={formData.last_name || ''} onChange={handleChange} placeholder="Enter last name" />
        </Form.Group>
        <Form.Group controlId="companyName" className="mb-3">
          <Form.Label>Company Name</Form.Label>
          <Form.Control type="text" name="company_name" value={formData.company_name || ''} onChange={handleChange} placeholder="Enter company name" />
        </Form.Group>
        <Button type="submit" variant="primary">Update Profile</Button>
      </Form>
    </Container>
  );
};

export default Profile;