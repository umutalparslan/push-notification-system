self.addEventListener('push', event => {
    const data = event.data.json();
    self.registration.showNotification(data.title, {
      body: data.body,
    });
  });
  
  self.addEventListener('notificationclick', event => {
    event.notification.close();
    console.log('Notification clicked');
  });