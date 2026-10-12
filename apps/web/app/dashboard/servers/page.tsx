import { Metadata } from "next";
import ServersClient from "./ServersClient";

export const metadata: Metadata = {
  title: "My Servers | Pomo 2.0",
};

export default function ServersPage() {
  return <ServersClient />;
}
