// src/components/CampaignCreate.js
import React, { useState, useEffect, useCallback } from 'react';
import { Container, Form, Button, Alert, Row, Col, ProgressBar } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import jwt from 'jsonwebtoken';

const CampaignCreate = ({ token }) => {
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    application_ids: [],
    segment_query: null,
    scheduled_at: ''
  });
  const [apps, setApps] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/customers/applications', {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (Array.isArray(response.data)) {
          setApps(response.data);
          if (response.data.length === 0) setError('No applications found for this customer');
        } else {
          setError('Unexpected response format from server');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch applications');
      }
    };
    fetchApps();
  }, [token]);

  const handleChange = useCallback((e) => {
    if (e.target.name === 'application_ids') {
      const value = Array.from(e.target.selectedOptions, option => option.value);
      setFormData(prev => ({ ...prev, application_ids: value }));
    } else {
      setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    }
  }, []);

  const handleSegmentChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      segment_query: { ...(prev.segment_query || {}), [name]: value }
    }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');
    setSuccess('');
    setProgress(0);

    try {
      console.log('Form data being sent:', JSON.stringify(formData, null, 2));
      const response = await axios.post('http://localhost:3000/api/campaigns', formData, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      console.log('Campaign response:', response.data);
      const campaignId = response.data.id;

      const decoded = jwt.decode(token);
      if (!decoded || !decoded.customer_id) {
        setError('Invalid token or customer ID not found');
        setIsSubmitting(false);
        return;
      }

      const validateResponse = await axios.get(`http://localhost:3000/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      if (!validateResponse.data || validateResponse.data.customer_id !== decoded.customer_id) {
        setError(`Invalid campaign or not authorized. Campaign customer_id: ${validateResponse.data?.customer_id}, Token customer_id: ${decoded.customer_id}`);
        setIsSubmitting(false);
        return;
      }

      setSuccess('Campaign created, sending...');
      setProgress(10);

      const checkCampaignStatus = async (retries = 20, interval = 200) => {
        let attempt = 0;
        const check = async () => {
          try {
            const statusResponse = await axios.get(`http://localhost:3000/api/campaigns/${campaignId}`, {
              headers: { Authorization: `Bearer ${token}` },
              timeout: 2000,
            });
            const campaign = statusResponse.data;
            console.log('Campaign status check:', campaign);
            if (campaign.status === 'sent') {
              setProgress(100);
              setTimeout(() => navigate('/dashboard'), 500);
              setIsSubmitting(false);
              return;
            }
            if (attempt < retries) {
              attempt++;
              setProgress(prev => Math.min(prev + (90 / retries), 90));
              setTimeout(check, interval);
            } else {
              throw new Error('Campaign send timeout');
            }
          } catch (err) {
            setError(err.response?.data?.error || 'Failed to check campaign status');
            console.error('Error checking campaign status:', err);
            setIsSubmitting(false);
          }
        };
        await check();
      };

      await axios.post(`http://localhost:3000/api/campaigns/${campaignId}/send`, {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 2000,
      });
      await checkCampaignStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create or send campaign');
      console.error('Error creating/sending campaign:', err);
      setIsSubmitting(false);
    }
  }, [token, formData, navigate]);

  return (
    <Container className="py-4">
      <h1 className="mb-4">Create Campaign</h1>
      {error && <Alert variant="danger">{error}</Alert>}
      {success && <Alert variant="success">{success}</Alert>}
      {progress > 0 && <ProgressBar now={progress} label={`${progress}%`} className="mb-3" />}
      <Form onSubmit={handleSubmit}>
        <Row>
          <Col md={6}>
            <Form.Group controlId="title" className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Campaign Title"
                required
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group controlId="message" className="mb-3">
              <Form.Label>Message</Form.Label>
              <Form.Control
                type="text"
                name="message"
                value={formData.message}
                onChange={handleChange}
                placeholder="Message"
                required
              />
            </Form.Group>
          </Col>
        </Row>
        <Form.Group controlId="applicationIds" className="mb-3">
          <Form.Label>Applications</Form.Label>
          <Form.Control
            as="select"
            multiple
            name="application_ids"
            value={formData.application_ids}
            onChange={handleChange}
            required
          >
            {apps.length > 0 ? (
              apps.map(app => (
                <option key={app.id} value={app.id}>{app.name} ({app.platform})</option>
              ))
            ) : (
              <option disabled>No applications available</option>
            )}
          </Form.Control>
        </Form.Group>
        <Form.Group controlId="target" className="mb-3">
          <Form.Label>Target</Form.Label>
          <Form.Check
            type="radio"
            label="Everyone"
            name="target"
            value="everyone"
            onChange={() => setFormData(prev => ({ ...prev, segment_query: null }))}
            checked={!formData.segment_query}
          />
          <Form.Check
            type="radio"
            label="Segment"
            name="target"
            value="segment"
            onChange={() => setFormData(prev => ({ ...prev, segment_query: {} }))}
            checked={!!formData.segment_query}
          />
        </Form.Group>
        {formData.segment_query && (
          <Row>
            <Col md={6}>
              <Form.Group controlId="segmentCity" className="mb-3">
                <Form.Label>City</Form.Label>
                <Form.Control
                  type="text"
                  name="city"
                  value={formData.segment_query?.city || ''}
                  onChange={handleSegmentChange}
                  placeholder="City"
                />
              </Form.Group>
            </Col>
          </Row>
        )}
        <Form.Group controlId="scheduledAt" className="mb-3">
          <Form.Label>Schedule (Optional)</Form.Label>
          <Form.Control
            type="datetime-local"
            name="scheduled_at"
            value={formData.scheduled_at}
            onChange={handleChange}
          />
        </Form.Group>
        <Button type="submit" variant="primary" disabled={isSubmitting}>Send Campaign</Button>
      </Form>
    </Container>
  );
};

export default CampaignCreate;