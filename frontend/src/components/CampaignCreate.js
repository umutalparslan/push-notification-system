// src/components/CampaignCreate.js (güncellenmiş hali)
import React, { useState, useEffect } from 'react';
import { Container, Form, Button, Alert, Row, Col, ProgressBar } from 'react-bootstrap';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import jwt from 'jsonwebtoken'; // JSON Web Token kütüphanesini ekle

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
  const [isSubmitting, setIsSubmitting] = useState(false); // Tekrarlı submit’i engelle
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await axios.get('http://localhost:3000/api/customers/applications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (Array.isArray(response.data)) {
          setApps(response.data);
          if (response.data.length === 0) {
            setError('No applications found for this customer');
          }
        } else {
          setApps([]);
          setError('Unexpected response format from server');
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to fetch applications');
        setApps([]);
      }
    };
    fetchApps();
  }, [token]);

  const handleChange = (e) => {
    if (e.target.name === 'application_ids') {
      const value = Array.from(e.target.selectedOptions, option => option.value);
      setFormData({ ...formData, application_ids: value });
    } else {
      setFormData({ ...formData, [e.target.name]: e.target.value });
    }
  };

  const handleSegmentChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      segment_query: { ...(formData.segment_query || {}), [name]: value }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return; // Tekrarlı submit’i engelle
    setIsSubmitting(true);
    console.log('Form data being sent:', JSON.stringify(formData, null, 2)); //Daha detaylı log
    try {
      const response = await axios.post('http://localhost:3000/api/campaigns', {
        ...formData
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('Campaign response:', response.data);
      const campaignId = response.data.id;

      // Token’ı log’la ve decode et
      console.log('JWT Token:', token);
      const decoded = jwt.decode(token);
      console.log('Decoded Token:', decoded);
      if (!decoded || !decoded.customer_id) {
        setError('Invalid token or customer ID not found in token');
        setIsSubmitting(false);
        return;
      }

      // Kampanya ID’sini doğrula
      const validateResponse = await axios.get(`http://localhost:3000/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!validateResponse.data || validateResponse.data.customer_id !== decoded.customer_id) {
        setError(`Invalid campaign or not authorized. Campaign customer_id: ${validateResponse.data?.customer_id}, Token customer_id: ${decoded.customer_id}`);
        setIsSubmitting(false);
        return;
      }

      setSuccess('Campaign created, sending...');
      setProgress(10);

      // Kampanyanın status’ünü kontrol ederek gönderimi bekle
// src/components/CampaignCreate.js (güncellenmiş hali)
const checkCampaignStatus = async (maxRetries = 30, interval = 500) => {
  let retries = 0;
  const check = async () => {
    try {
      const statusResponse = await axios.get(`http://localhost:3000/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000, // 10 saniye timeout (daha uzun bekleme)
      });
      const campaign = statusResponse.data;
      console.log('Campaign status check:', campaign);
      if (campaign.status === 'sent') {
        setProgress(100);
        setTimeout(() => navigate('/dashboard'), 1000);
        setIsSubmitting(false);
        return;
      }
      if (campaign.status === 'draft' && retries < maxRetries) {
        retries++;
        setProgress(prev => Math.min(prev + (90 / maxRetries), 90)); // Daha hızlı progress
        setTimeout(check, interval); // 500ms aralıklarla kontrol et
      } else {
        setError('Campaign failed to send: Timeout or status not updated');
        setIsSubmitting(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check campaign status');
      console.error('Error checking campaign status:', err);
      setIsSubmitting(false);
    }
  };
  check();
};

// handleSubmit içinde çağır:
setSuccess('Campaign created, sending...');
setProgress(10);
checkCampaignStatus(); // maxRetries ve interval varsayılan değerlerle
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create campaign');
      console.error('Error creating campaign:', err.response?.data);
      setIsSubmitting(false);
    }
  };

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
            onChange={() => setFormData({ ...formData, segment_query: null })}
            checked={!formData.segment_query}
          />
          <Form.Check
            type="radio"
            label="Segment"
            name="target"
            value="segment"
            onChange={() => setFormData({ ...formData, segment_query: {} })}
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