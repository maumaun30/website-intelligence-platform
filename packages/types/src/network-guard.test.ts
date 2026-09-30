import { describe, expect, it } from 'vitest';

import { isBlockedAddress, isBlockedHostname } from './network-guard';

describe('isBlockedAddress', () => {
  it('allows ordinary public addresses', () => {
    for (const address of [
      '93.184.216.34',
      '8.8.8.8',
      '1.1.1.1',
      '2606:2800:220:1:248:1893:25c8:1946',
    ]) {
      expect(isBlockedAddress(address)).toBe(false);
    }
  });

  it('blocks loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('127.255.255.254')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
  });

  it('blocks the RFC 1918 private ranges, and only those', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
    // Neighbours of 172.16/12 that are public.
    expect(isBlockedAddress('172.15.0.1')).toBe(false);
    expect(isBlockedAddress('172.32.0.1')).toBe(false);
  });

  it('blocks the cloud metadata address and the rest of link-local', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('169.254.0.1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
  });

  it('blocks carrier-grade NAT, benchmarking, documentation and reserved space', () => {
    expect(isBlockedAddress('100.64.0.1')).toBe(true);
    expect(isBlockedAddress('198.18.0.1')).toBe(true);
    expect(isBlockedAddress('192.0.2.1')).toBe(true);
    expect(isBlockedAddress('203.0.113.1')).toBe(true);
    expect(isBlockedAddress('240.0.0.1')).toBe(true);
    expect(isBlockedAddress('255.255.255.255')).toBe(true);
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
  });

  it('blocks multicast', () => {
    expect(isBlockedAddress('224.0.0.1')).toBe(true);
    expect(isBlockedAddress('ff02::1')).toBe(true);
  });

  it('blocks IPv6 unique-local and unspecified', () => {
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456:789a::1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
  });

  it('sees through IPv4-mapped and NAT64 IPv6 forms', () => {
    // ::ffff:127.0.0.1 reaches loopback despite looking like IPv6.
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedAddress('64:ff9b::169.254.169.254')).toBe(true);
    expect(isBlockedAddress('::ffff:93.184.216.34')).toBe(false);
  });

  it('blocks anything it cannot parse, rather than assuming it is safe', () => {
    expect(isBlockedAddress('not-an-address')).toBe(true);
    expect(isBlockedAddress('')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it('blocks names that always mean this machine', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('LOCALHOST')).toBe(true);
    expect(isBlockedHostname('api.localhost')).toBe(true);
    expect(isBlockedHostname('printer.local')).toBe(true);
    expect(isBlockedHostname('service.internal')).toBe(true);
  });

  it('blocks a literal private address written as the host', () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('169.254.169.254')).toBe(true);
    expect(isBlockedHostname('[::1]')).toBe(true);
  });

  it('allows ordinary names and public literal addresses', () => {
    expect(isBlockedHostname('example.com')).toBe(false);
    expect(isBlockedHostname('shop.acme.co.uk')).toBe(false);
    expect(isBlockedHostname('93.184.216.34')).toBe(false);
  });
});
