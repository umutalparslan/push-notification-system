import React from 'react';
import { Container, Navbar, Nav, Button, Row, Col } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const Home = ({ token, setToken, handleLogout }) => {
  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand href="/">PushXAI</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="ms-auto">
              {token ? (
                <Button variant="outline-light" onClick={handleLogout}>Logout</Button>
              ) : (
                <>
                  <Nav.Link as={Link} to="/login" className="text-light">Login</Nav.Link>
                  <Nav.Link as={Link} to="/register" className="text-light">Register</Nav.Link>
                </>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <Container className="py-5 text-center">
        <Row>
          <Col>
            <h1 className="display-4 mb-4">Welcome to PushXAI</h1>
            <p className="lead mb-4">The ultimate push notification platform for your business. Reach your audience effortlessly with our powerful tools.</p>
            {!token && (
              <div>
                <Button as={Link} to="/register" variant="primary" size="lg" className="me-2">Get Started</Button>
                <Button as={Link} to="/login" variant="outline-primary" size="lg">Login</Button>
              </div>
            )}
          </Col>
        </Row>
      </Container>
      <footer className="bg-dark text-light py-3 text-center">
        <Container>
          <p>&copy; 2025 PushXAI. All rights reserved.</p>
        </Container>
      </footer>
    </>
  );
};

export default Home;