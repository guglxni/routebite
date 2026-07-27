import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { compareInterceptRank, selectTopK } from "@routebite/shared/algorithms";
import { useJourney } from "~/stores/journey";
import { JourneyMap } from "~/components/map/JourneyMap";
import { QuickRouteForm } from "~/components/journey/QuickRouteForm";
import { WeatherAlertsBanner } from "~/components/journey/WeatherAlertsBanner";
import { RouteOptimizePanel } from "~/components/journey/RouteOptimizePanel";
import { PageHeader } from "~/components/dashboard/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

export default function RouteBuilder() {
  const navigate = useNavigate();
  const {
    current,
    intercepts,
    customerPosition,
    selectedInterceptId,
    setSelectedIntercept,
  } = useJourney();

  const [draftOrigin, setDraftOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [draftDestination, setDraftDestination] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const origin = current ? { lat: current.originLat, lng: current.originLng } : null;
  const destination = current ? { lat: current.destinationLat, lng: current.destinationLng } : null;

  const topId = useMemo(
    () => (intercepts.length ? selectTopK(intercepts, 1, compareInterceptRank)[0]?.id : null),
    [intercepts],
  );

  useEffect(() => {
    if (!selectedInterceptId && topId) setSelectedIntercept(topId);
  }, [selectedInterceptId, topId, setSelectedIntercept]);

  const onSuccess = useCallback(() => {
    if (useJourney.getState().intercepts.length > 0) {
      navigate("/intercepts");
    }
  }, [navigate]);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 pb-16">
      <PageHeader
        eyebrow="Journey"
        title="Plan the route"
        description="Traffic-aware routing, Places autocomplete, rider reach zones, and outdoor-condition scoring."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass border-border-subtle order-2 lg:order-1">
          <CardHeader>
            <CardTitle>Trip details</CardTitle>
            <CardDescription>
              Search places with Google autocomplete. Your trip mode is separate from delivery
              two-wheeler routing used for rider zones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <QuickRouteForm
              datalistId="rb-route-places"
              onSuccess={onSuccess}
              onDraftPlacesChange={({ origin: o, destination: d }) => {
                setDraftOrigin(o ? { lat: o.lat, lng: o.lng } : null);
                setDraftDestination(d ? { lat: d.lat, lng: d.lng } : null);
              }}
            />
            {current && intercepts.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                className="mt-4 w-full"
                onClick={() => navigate("/intercepts")}
              >
                Continue to intercepts
              </Button>
            )}
            {current &&
              (current.outdoorConditions || (current.weatherWarnings?.length ?? 0) > 0) && (
                <WeatherAlertsBanner
                  className="mt-4"
                  warnings={current.weatherWarnings}
                  outdoorConditions={current.outdoorConditions}
                />
              )}
            {current && intercepts.length > 0 && (
              <RouteOptimizePanel className="mt-4" journey={current} intercepts={intercepts} />
            )}
          </CardContent>
        </Card>

        <div className="order-1 lg:order-2">
          <JourneyMap
            origin={origin}
            destination={destination}
            draftOrigin={draftOrigin}
            draftDestination={draftDestination}
            routePoints={current?.routePoints}
            intercepts={intercepts}
            customerPosition={customerPosition}
            selectedInterceptId={selectedInterceptId ?? topId}
            onSelectIntercept={setSelectedIntercept}
            heightClassName="h-[360px] lg:h-full min-h-[360px]"
          />
        </div>
      </div>
    </div>
  );
}
