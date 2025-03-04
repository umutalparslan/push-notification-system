import React, { useState } from 'react';
import { Container, Form, Button, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const Register = ({ setToken }) => {
  const [formData, setFormData] = useState({
    email: '', password: '', phone: '', address: '', first_name: '', last_name: '', company_name: ''
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      await axios.post('http://localhost:3000/api/customers/register', formData);
      const response = await axios.post('http://localhost:3000/api/customers/login', {
        email: formData.email,
        password: formData.password
      });
      const token = response.data.token;
      localStorage.setItem('token', token);
      setToken(token);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <Container className="d-flex justify-content-center align-items-center min-vh-100">
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-light p-5 rounded shadow w-100"
        style={{ maxWidth: '500px' }}
      >
        <h2 className="mb-4 text-center">Register</h2>
        <Form onSubmit={handleRegister}>
          <Form.Group controlId="email" className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Enter email" />
          </Form.Group>
          <Form.Group controlId="password" className="mb-3">
            <Form.Label>Password</Form.Label>
            <Form.Control type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Enter password" />
          </Form.Group>
          <Form.Group controlId="phone" className="mb-3">
            <Form.Label>Phone</Form.Label>
            <Form.Control type="text" name="phone" value={formData.phone} onChange={handleChange} placeholder="Enter phone" />
          </Form.Group>
          <Form.Group controlId="address" className="mb-3">
            <Form.Label>Address</Form.Label>
            <Form.Control type="text" name="address" value={formData.address} onChange={handleChange} placeholder="Enter address" />
          </Form.Group>
          <Form.Group controlId="firstName" className="mb-3">
            <Form.Label>First Name</Form.Label>
            <Form.Control type="text" name="first_name" value={formData.first_name} onChange={handleChange} placeholder="Enter first name" />
          </Form.Group>
          <Form.Group controlId="lastName" className="mb-3">
            <Form.Label>Last Name</Form.Label>
            <Form.Control type="text" name="last_name" value={formData.last_name} onChange={handleChange} placeholder="Enter last name" />
          </Form.Group>
          <Form.Group controlId="companyName" className="mb-3">
            <Form.Label>Company Name</Form.Label>
            <Form.Control type="text" name="company_name" value={formData.company_name} onChange={handleChange} placeholder="Enter company name" />
          </Form.Group>
          {error && <Alert variant="danger">{error}</Alert>}
          <Button type="submit" variant="primary" className="w-100">Register</Button>
          <p className="mt-3 text-center">
            Already have an account? <Link to="/login">Login</Link>
          </p>
        </Form>
      </motion.div>
    </Container>
  );
};

export default Register;