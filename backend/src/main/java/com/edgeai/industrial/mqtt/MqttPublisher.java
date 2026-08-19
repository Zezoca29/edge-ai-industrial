package com.edgeai.industrial.mqtt;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.IMqttClient;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class MqttPublisher {

    private final MqttPahoClientFactory clientFactory;
    private final String brokerUrl;
    private final String clientId;
    private IMqttClient client;

    public MqttPublisher(MqttPahoClientFactory clientFactory,
                         @Value("${mqtt.broker-url}") String brokerUrl,
                         @Value("${mqtt.client-id}") String clientId) {
        this.clientFactory = clientFactory;
        this.brokerUrl = brokerUrl;
        this.clientId = clientId;
    }

    @PostConstruct
    public void init() {
        try {
            client = clientFactory.getClientInstance(brokerUrl, clientId + "-pub");
            client.connect(clientFactory.getConnectionOptions());
            log.info("MQTT publisher client connected to {}", brokerUrl);
        } catch (MqttException e) {
            log.error("Failed to connect MQTT publisher client: {}", e.getMessage(), e);
        }
    }

    public void publish(String topic, String payload) {
        if (client == null || !client.isConnected()) {
            log.warn("MQTT client not connected — skipping publish to {}", topic);
            return;
        }
        try {
            MqttMessage msg = new MqttMessage(payload.getBytes());
            msg.setQos(0);
            client.publish(topic, msg);
            log.info("MQTT published to {}: {}", topic, payload);
        } catch (MqttException e) {
            log.error("MQTT publish error: {}", e.getMessage(), e);
        }
    }
}
